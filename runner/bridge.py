"""Loopback-only REST bridge. No production action occurs on import or /session."""
from __future__ import annotations
import argparse
import copy
import fcntl
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse, quote
from urllib.request import Request, build_opener, HTTPRedirectHandler

VERSION = '1.0.0'
DEFAULT_ORIGINS = {'http://localhost:5173', 'http://127.0.0.1:5173', 'https://calla.yeseo.im'}
ACTIVE = {'running', 'waiting_login', 'waiting_review', 'stopping'}
BLOCKED_PHASES = {'submitting', 'success', 'needs_review'}


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


class StopRequested(Exception):
    pass


class SourceChanged(Exception):
    pass


def now():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def valid_origin(value):
    try:
        p = urlparse(value)
        return (p.scheme in {'http', 'https'} and bool(p.hostname) and '*' not in value and
                not p.username and not p.password and p.path == '' and
                not p.params and not p.query and not p.fragment)
    except (TypeError, ValueError):
        return False


def allowed_origins():
    extra = set(filter(None, (s.strip() for s in os.environ.get('CALLA_ALLOWED_ORIGINS', '').split(','))))
    values = DEFAULT_ORIGINS | extra
    if any(not valid_origin(v) for v in values):
        raise ValueError('CALLA_ALLOWED_ORIGINS에는 경로 없는 정확한 origin만 사용할 수 있습니다.')
    for v in extra:
        p = urlparse(v)
        if p.scheme != 'https' and p.hostname not in {'localhost', '127.0.0.1'}:
            raise ValueError('추가 배포 origin은 HTTPS여야 합니다.')
    return values


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    tmp = path.with_name(path.name + '.' + secrets.token_hex(6) + '.tmp')
    fd = os.open(tmp, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(value, f, ensure_ascii=False, separators=(',', ':'))
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
        dfd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(dfd)
        finally:
            os.close(dfd)
    finally:
        if tmp.exists():
            tmp.unlink()


def pairing_token(state_dir):
    state_dir = Path(state_dir)
    state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(state_dir, 0o700)
    path = state_dir / 'connection-token'
    if path.is_symlink():
        raise RuntimeError('연결 토큰 경로는 심볼릭 링크일 수 없습니다.')
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        os.chmod(path, 0o600)
        token = path.read_text().strip()
        if len(token) < 40:
            raise RuntimeError('연결 토큰 파일이 올바르지 않습니다.')
        return token
    token = secrets.token_urlsafe(32)
    with os.fdopen(fd, 'w') as f:
        f.write(token + '\n')
    return token


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class WorkerClient:
    def __init__(self, origin, token):
        self.origin, self.token = origin, token
        self.http = build_opener(NoRedirect())

    def call(self, path, payload=None):
        token = self.token() if callable(self.token) else self.token
        req = Request(self.origin + path,
                      data=None if payload is None else json.dumps(payload).encode(),
                      headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/json', 'Content-Type': 'application/json'},
                      method='GET' if payload is None else 'POST')
        try:
            with self.http.open(req, timeout=20) as res:
                raw = res.read(10_000_001)
            if len(raw) > 10_000_000:
                raise ApiError(502, '서버 응답이 너무 큽니다.')
            return json.loads(raw)
        except HTTPError as e:
            raise ApiError(401 if e.code in {401, 403} else 502,
                           '관리자 로그인을 확인해 주세요.' if e.code in {401, 403} else f'서버 요청 실패 ({e.code}).') from None
        except (URLError, TimeoutError, json.JSONDecodeError):
            raise ApiError(502, '웹 서버에 연결할 수 없습니다.') from None

    def me(self):
        data = self.call('/api/me')
        if data.get('role') != 'admin' or not data.get('user', {}).get('id'):
            raise ApiError(403, '관리자 계정만 자동 등록을 실행할 수 있습니다.')
        return data

    def context(self, list_id):
        return self.call('/api/runner/context?listId=' + quote(list_id, safe=''))

    def status(self, item_id, channel, status, goods_no=None, error=None, warnings=None, expected_updated_at=None):
        return self.call('/api/runner/registrations', {'itemId': item_id, 'channel': channel,
                         'status': status, 'goodsNo': goods_no, 'errorMessage': error, 'warnings': warnings or [],
                         **({'expectedUpdatedAt': expected_updated_at} if expected_updated_at else {})})

    def complete(self, item_id):
        return self.call('/api/runner/complete', {'itemId': item_id})


class JobUi:
    def __init__(self, manager, job_id):
        self.manager, self.job_id = manager, job_id

    def log(self, message):
        self.manager.log(str(message))

    def check_stop(self):
        if self.manager.stop_event.is_set():
            raise StopRequested()

    def wait(self, state, message):
        self.check_stop()
        self.manager.resume_event.clear()
        self.manager.update(state=state, message=message)
        self.log(message)
        while not self.manager.resume_event.wait(.25):
            self.check_stop()
        self.check_stop()
        self.manager.update(state='running', message='진행 중')


class Manager:
    def __init__(self, state_dir, worker_factory=WorkerClient, engine_factory=None):
        self.state_dir = Path(state_dir)
        self.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.path = self.state_dir / 'journal.json'
        self.lock = threading.RLock()
        self.worker_factory, self.engine_factory = worker_factory, engine_factory
        self.session = None
        self.stop_event, self.resume_event = threading.Event(), threading.Event()
        self.thread = None
        self.data = json.loads(self.path.read_text()) if self.path.exists() else {'jobs': {}, 'keys': {}, 'registrations': {}, 'latest': None}
        changed = False
        for job in self.data['jobs'].values():
            if job['state'] in ACTIVE:
                job.update(state='needs_review', message='실행기가 종료되었습니다. 고도몰의 저장 결과를 확인하세요.', updatedAt=now())
                changed = True
        for row in self.data['registrations'].values():
            if row['phase'] in {'prepared', 'submitting'}:
                row['phase'] = 'needs_review'
                changed = True
        if changed:
            self.persist()

    def persist(self):
        atomic_json(self.path, self.data)

    def token_for(self, origin):
        with self.lock:
            if not self.session or self.session['origin'] != origin:
                raise ApiError(401, '웹 관리자 계정을 연결해 주세요.')
            return self.session['accessToken']

    def api(self, origin):
        return self.worker_factory(origin, lambda: self.token_for(origin))

    def connect(self, origin, access_token):
        if not isinstance(access_token, str) or not 16 <= len(access_token) <= 12000:
            raise ApiError(400, '웹 로그인 토큰이 올바르지 않습니다.')
        me = self.worker_factory(origin, lambda: access_token).me()
        with self.lock:
            job = self.current()
            if job and job['state'] in ACTIVE and self.session and self.session['origin'] != origin:
                raise ApiError(409, '다른 웹사이트에서 시작한 등록이 진행 중입니다.')
            if job and job['state'] in ACTIVE and self.session and self.session['userId'] != me['user']['id']:
                raise ApiError(409, '등록 중에는 연결된 관리자 계정을 변경할 수 없습니다.')
            self.session = {'origin': origin, 'accessToken': access_token, 'userId': me['user']['id']}
        return {'connected': True, 'user': me['user'], 'runnerVersion': VERSION}

    def authorize(self, origin):
        self.api(origin).me()

    def current(self):
        return self.data['jobs'].get(self.data['latest'])

    def snapshot(self):
        with self.lock:
            return {'connected': True, 'runnerVersion': VERSION, 'capabilities': ['retail', 'wholesale'], 'job': copy.deepcopy(self.current())}

    def update(self, **values):
        with self.lock:
            self.current().update(values, updatedAt=now())
            self.persist()

    def log(self, message):
        with self.lock:
            logs = self.current()['logs']
            # Never log access tokens, headers or the full context payload.
            logs.append({'time': now(), 'message': message[:2000]})
            del logs[:-300]
            self.persist()

    def journal(self, item_id, channel, phase, **extra):
        with self.lock:
            key = item_id + ':' + channel
            self.data['registrations'][key] = {'phase': phase, 'jobId': self.current()['id'], 'updatedAt': now(), **extra}
            self.persist()

    def submit(self, origin, body):
        def uid(v):
            try:
                return str(uuid.UUID(v))
            except (ValueError, TypeError, AttributeError):
                raise ApiError(400, '리스트와 상품 ID는 UUID여야 합니다.') from None
        list_id = uid(body.get('listId'))
        ids = body.get('itemIds')
        channels = body.get('channels')
        if not isinstance(ids, list) or not 1 <= len(ids) <= 500:
            raise ApiError(400, '상품을 1–500개 선택해 주세요.')
        ids = list(dict.fromkeys(uid(v) for v in ids))
        if not isinstance(channels, list) or not channels or any(c not in {'retail', 'wholesale'} for c in channels):
            raise ApiError(400, '고도몰 소매 또는 도매 채널을 선택해 주세요.')
        channels = list(dict.fromkeys(channels))
        if not isinstance(body.get('dryRun'), bool):
            raise ApiError(400, 'dryRun은 true 또는 false여야 합니다.')
        key = body.get('idempotencyKey')
        if not isinstance(key, str) or not 8 <= len(key) <= 128:
            raise ApiError(400, '8–128자의 idempotencyKey가 필요합니다.')
        params = {'listId': list_id, 'itemIds': ids, 'channels': channels, 'dryRun': body['dryRun']}
        digest = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()
        with self.lock:
            old = self.data['keys'].get(key)
            if old:
                job = self.data['jobs'][old]
                if job['fingerprint'] != digest or job['origin'] != origin:
                    raise ApiError(409, '같은 요청 키로 다른 작업을 시작할 수 없습니다.')
                return {'job': copy.deepcopy(job), 'duplicate': True}
            current = self.current()
            if current and current['state'] in ACTIVE:
                raise ApiError(409, '진행 중인 등록이 있습니다.')
            job_id = str(uuid.uuid4())
            job = {'id': job_id, **params, 'origin': origin, 'fingerprint': digest, 'state': 'running',
                   'current': 0, 'total': 0, 'success': 0, 'failed': 0, 'reviewed': 0,
                   'createdAt': now(), 'updatedAt': now(), 'logs': [], 'message': '저장된 상품 정보를 확인하고 있습니다.'}
            self.data['jobs'][job_id] = job
            self.data['keys'][key] = job_id
            self.data['latest'] = job_id
            self.stop_event.clear()
            self.resume_event.clear()
            self.persist()
            self.thread = threading.Thread(target=self.execute, args=(origin, params), daemon=True)
            self.thread.start()
            return {'job': copy.deepcopy(job), 'duplicate': False}

    def control(self, job_id, action):
        with self.lock:
            job = self.current()
            if not job or job['id'] != job_id:
                raise ApiError(404, '현재 실행 중인 작업이 아닙니다.')
            if action == 'stop':
                if job['state'] in ACTIVE:
                    self.stop_event.set()
                    self.resume_event.set()
                    job.update(state='stopping', message='현재 채널의 처리를 마친 뒤 중단합니다.')
                    self.persist()
            elif action == 'continue':
                if job['state'] not in {'waiting_login', 'waiting_review'}:
                    raise ApiError(409, '계속할 대기 작업이 없습니다.')
                self.resume_event.set()
            return {'job': copy.deepcopy(job)}

    def execute(self, origin, params):
        ui = JobUi(self, self.current()['id'])
        api = self.api(origin)
        try:
            context = api.context(params['listId'])
            raw_items = {row['id']: row for row in context.get('items', [])}
            source_fields = ('done', 'brand', 'name_own', 'model', 'need_retail', 'need_wholesale', 'price_retail_regular', 'price_retail', 'price_wholesale', 'price_wholesale_master', 'automation', 'image_url', 'origin')
            def source_snapshot(row, settings):
                return json.dumps({'item': {key: row.get(key) for key in source_fields}, 'settings': settings}, sort_keys=True, ensure_ascii=False)
            baselines = {key: source_snapshot(row, context.get('settings', {})) for key, row in raw_items.items()}
            def check_source(live, item_id):
                row = next((row for row in live.get('items', []) if row.get('id') == item_id), None)
                if row is None or source_snapshot(row, live.get('settings', {})) != baselines[item_id]:
                    raise SourceChanged('실행 대기 중 상품 정보 또는 설정이 변경되었습니다. 목록을 다시 불러온 뒤 등록을 시작하세요.')
            if any(i not in raw_items for i in params['itemIds']):
                raise ApiError(409, '선택한 상품이 저장된 리스트에 없습니다. 먼저 목록을 저장하세요.')
            from .engine.db import Item
            regs = {(r['item_id'], r['channel']): r for r in context.get('registrations', [])}
            work = []
            for channel in params['channels']:
                for item_id in params['itemIds']:
                    row = raw_items[item_id]
                    if row.get('list_id') != params['listId']:
                        raise ApiError(409, '다른 리스트의 상품은 등록할 수 없습니다.')
                    item = Item.from_row(row)
                    if item.done or not item.needs(channel):
                        continue
                    previous = regs.get((item_id, channel), {})
                    local = self.data['registrations'].get(item_id + ':' + channel, {})
                    if previous.get('status') == 'success':
                        continue
                    if previous.get('status') in {'running', 'needs_review'} or local.get('phase') in BLOCKED_PHASES:
                        raise ApiError(409, '이미 실행했거나 저장 결과 확인이 필요한 상품입니다. 고도몰 결과를 먼저 확인하세요.')
                    work.append((item, channel))
            self.update(total=len(work))
            if not work:
                self.update(state='completed', message='등록할 대기 상품이 없습니다.')
                return
            ui.check_stop()
            factory = self.engine_factory
            if factory is None:
                from .native_engine import NativeEngine
                factory = NativeEngine
            with factory(self.state_dir, ui) as engine:
                for item, channel in work:
                    ui.check_stop()
                    self.update(itemId=item.id, channel=channel, message=item.display_name)
                    ui.log(f'{item.display_name} · {channel} 준비 중')
                    submitting = False
                    claimed = False
                    claim_revision = None
                    try:
                        # Refresh before each item. Avoid stale success/running snapshots.
                        live = api.context(params['listId'])
                        check_source(live, item.id)
                        state = next((r.get('status') for r in live.get('registrations', []) if r['item_id'] == item.id and r['channel'] == channel), None)
                        if state == 'success':
                            self.update(current=self.current()['current'] + 1)
                            continue
                        if state in {'running', 'needs_review'}:
                            raise ApiError(409, '다른 실행기가 처리 중이거나 저장 결과 확인이 필요합니다.')
                        if not params['dryRun']:
                            claim = api.status(item.id, channel, 'running')
                            claimed = True
                            claim_revision = (claim or {}).get('registration', {}).get('updated_at')
                            if not claim_revision:
                                raise ApiError(502, '서버가 실행 버전을 반환하지 않았습니다. 관리자 연결을 확인하세요.')
                            self.journal(item.id, channel, 'prepared', claimUpdatedAt=claim_revision)
                        prepared = engine.prepare(item, channel)
                        if params['dryRun']:
                            ui.wait('waiting_review', '검토 모드입니다. 저장 버튼을 누르지 말고 입력 내용만 확인한 뒤 계속을 누르세요.')
                            check_source(api.context(params['listId']), item.id)
                            if hasattr(engine, 'review_changed') and engine.review_changed(prepared):
                                self.journal(item.id, channel, 'needs_review', manualReviewChange=True)
                                self.update(state='needs_review', message='검토 중 관리자 화면이 변경되었습니다. 수동 저장 여부를 확인하세요.')
                                return
                            self.update(reviewed=self.current()['reviewed'] + 1)
                        else:
                            ui.check_stop()
                            # Confirm the current web session before the irreversible click.
                            api.me()
                            check_source(api.context(params['listId']), item.id)
                            ui.check_stop()
                            self.journal(item.id, channel, 'submitting')
                            submitting = True
                            result = engine.submit(prepared, item)
                            goods_no = str(result.get('goodsNo') or '')
                            if not result.get('ok') or not goods_no.isdigit():
                                raise ApiError(409, '저장 응답을 확정할 수 없습니다. 고도몰에서 상품 등록 여부를 확인하세요.')
                            self.journal(item.id, channel, 'success', goodsNo=goods_no)
                            # If synchronization fails, preserve saved evidence and prohibit retry.
                            api.status(item.id, channel, 'success', goods_no, warnings=result.get('warnings', []))
                            api.complete(item.id)
                            self.update(success=self.current()['success'] + 1)
                            ui.log(f'{item.display_name} · {channel} 저장 완료 (상품번호 {goods_no})')
                    except SourceChanged as exc:
                        if claimed:
                            try:
                                api.status(item.id, channel, 'pending', expected_updated_at=claim_revision)
                                self.journal(item.id, channel, 'cancelled')
                            except Exception:
                                self.journal(item.id, channel, 'needs_review')
                                self.update(state='needs_review', message='상품 정보가 변경되어 멈췄지만 실행 상태 해제에 실패했습니다. 서버 상태를 확인하세요.')
                                return
                        self.update(state='failed', message=str(exc))
                        ui.log(str(exc))
                        return
                    except StopRequested:
                        if not params['dryRun'] and claimed and not submitting:
                            try:
                                api.status(item.id, channel, 'pending', expected_updated_at=claim_revision)
                                self.journal(item.id, channel, 'cancelled')
                            except Exception:
                                self.journal(item.id, channel, 'needs_review')
                                self.update(state='needs_review', message='저장 전에 중단했지만 서버의 실행 중 상태를 해제하지 못했습니다. 관리자 연결을 확인하세요.')
                                return
                        raise
                    except Exception as exc:
                        if submitting:
                            saved = self.data['registrations'].get(item.id + ':' + channel, {})
                            self.journal(item.id, channel, 'needs_review', goodsNo=saved.get('goodsNo'), savedEvidence=saved.get('phase') == 'success')
                            self.update(state='needs_review', message='저장 결과 또는 서버 동기화를 확인해야 합니다. 자동 재등록하지 않습니다.')
                            ui.log(str(exc))
                            return
                        if not params['dryRun'] and not claimed:
                            raise
                        if not params['dryRun']:
                            try:
                                api.status(item.id, channel, 'failed', error=str(exc)[:1000])
                                self.journal(item.id, channel, 'failed')
                            except Exception:
                                self.journal(item.id, channel, 'needs_review')
                                self.update(state='needs_review', message='등록 전 상태 동기화에 실패했습니다. 서버 상태를 확인해 주세요.')
                                return
                        self.update(failed=self.current()['failed'] + 1)
                        ui.log(f'입력 실패: {exc}')
                    self.update(current=self.current()['current'] + 1)
                    if self.stop_event.wait(1):
                        raise StopRequested()
            self.update(state='completed', message='선택한 작업 처리가 끝났습니다.')
        except StopRequested:
            self.update(state='completed', stopped=True, message='사용자 요청으로 중단했습니다.')
        except Exception as exc:
            self.update(state='failed', message=str(exc)[:1000])
            self.log(str(exc))


class Handler(BaseHTTPRequestHandler):
    server_version = 'CallaRunner/' + VERSION

    def log_message(self, *_):
        pass  # Request URLs and authorization headers are never logged.

    def reply(self, status, payload=None, origin=None):
        raw = b'' if payload is None else json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if origin:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        self.end_headers()
        self.wfile.write(raw)

    def origin_check(self):
        port = self.server.server_port
        if self.headers.get('Host') not in {f'127.0.0.1:{port}', f'localhost:{port}'}:
            raise ApiError(403, '허용되지 않은 Host입니다.')
        origin = self.headers.get('Origin')
        if origin not in self.server.origins:
            raise ApiError(403, '허용되지 않은 웹사이트입니다.')
        return origin

    def dispatch(self):
        origin = None
        try:
            origin = self.origin_check()
            if self.command == 'OPTIONS':
                if self.headers.get('Access-Control-Request-Method') not in {'GET', 'POST'}:
                    raise ApiError(403, '허용되지 않은 요청 방식입니다.')
                self.reply(204, origin=origin)
                return
            header = self.headers.get('Authorization', '')
            expected = 'Bearer ' + self.server.token
            if not hmac.compare_digest(header, expected):
                raise ApiError(401, '로컬 실행기 연결 토큰이 필요합니다.')
            body = {}
            if self.command == 'POST':
                if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                    raise ApiError(415, 'JSON 요청만 허용됩니다.')
                try:
                    length = int(self.headers.get('Content-Length', '0'))
                except ValueError:
                    raise ApiError(400, '잘못된 요청 크기입니다.') from None
                if not 0 < length <= 100000:
                    raise ApiError(413, '요청 크기가 올바르지 않습니다.')
                try:
                    body = json.loads(self.rfile.read(length))
                    if not isinstance(body, dict):
                        raise ValueError()
                except (ValueError, UnicodeDecodeError):
                    raise ApiError(400, '잘못된 JSON 요청입니다.') from None
            manager = self.server.manager
            if self.command == 'POST' and self.path == '/session':
                if body.get('origin') != origin:
                    raise ApiError(403, '웹사이트 origin이 일치하지 않습니다.')
                self.reply(200, manager.connect(origin, body.get('accessToken')), origin)
                return
            manager.authorize(origin)
            if self.command == 'GET' and self.path == '/status':
                self.reply(200, manager.snapshot(), origin)
            elif self.command == 'POST' and self.path == '/jobs':
                self.reply(202, manager.submit(origin, body), origin)
            elif self.command == 'POST' and self.path.startswith('/jobs/'):
                parts = self.path.split('/')
                if len(parts) != 4 or parts[3] not in {'continue', 'stop'}:
                    raise ApiError(404, 'API를 찾을 수 없습니다.')
                self.reply(200, manager.control(parts[2], parts[3]), origin)
            else:
                raise ApiError(404, 'API를 찾을 수 없습니다.')
        except ApiError as exc:
            self.reply(exc.status, {'error': str(exc)}, origin)
        except Exception:
            self.reply(500, {'error': '실행기 요청을 처리하지 못했습니다.'}, origin)

    do_GET = dispatch
    do_POST = dispatch
    do_OPTIONS = dispatch


def make_server(manager, token, origins, port=8765):
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.manager, server.token, server.origins = manager, token, origins
    server.daemon_threads = True
    return server


def main():
    parser = argparse.ArgumentParser(description='CALLA 관리자 웹사이트 전용 고도몰 실행기')
    parser.add_argument('--state-dir', default=str(Path.home() / '.calla-automate-runner'))
    parser.add_argument('--show-token', action='store_true', help='사용자가 직접 연결 토큰을 확인할 때만 사용')
    args = parser.parse_args()
    directory = Path(args.state_dir).expanduser()
    token = pairing_token(directory)
    if args.show_token:
        print(token)
        return
    lock_file = open(directory / 'runner.lock', 'a')
    os.chmod(directory / 'runner.lock', 0o600)
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit('실행기가 이미 실행 중입니다.') from None
    manager = Manager(directory)
    server = make_server(manager, token, allowed_origins())
    print('CALLA 실행기: http://127.0.0.1:8765 · 연결 토큰은 --show-token으로 확인합니다.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        current = manager.current()
        if current and current['state'] in ACTIVE:
            manager.control(current['id'], 'stop')
        if manager.thread:
            manager.thread.join(timeout=80)
    finally:
        server.server_close()
        lock_file.close()


if __name__ == '__main__':
    main()
