import copy
import http.client
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
import uuid
from runner.bridge import Manager, ApiError, WorkerClient, make_server, pairing_token

ORIGIN = 'http://localhost:5173'
LIST = str(uuid.uuid4())
ITEM = str(uuid.uuid4())


class Backend:
    def __init__(self):
        self.rows = []
        self.calls = []
        self.reject_sync = False
        self.reject_pending = False
        self.tokens = []
        self.role = 'admin'
        self.item = {'id': ITEM, 'list_id': LIST, 'seq': 1, 'name_own': '테스트 상품', 'brand': 'TEST',
                     'model': 'T-1', 'need_retail': '필요', 'need_wholesale': '불필요', 'done': False,
                     'price_retail': 1000, 'automation': {'categoryCodes': {'retail': '001'}}}

    def client(self, origin, token):
        backend = self
        class Client:
            def me(self):
                backend.tokens.append(token() if callable(token) else token)
                if backend.role != 'admin':
                    raise ApiError(403, 'admin required')
                return {'role': 'admin', 'user': {'id': 'admin-1'}}
            def context(self, _):
                self.me()
                return {'list': {'id': LIST}, 'items': [copy.deepcopy(backend.item)], 'registrations': copy.deepcopy(backend.rows), 'settings': {}}
            def status(self, item_id, channel, status, goods_no=None, error=None, warnings=None, expected_updated_at=None):
                self.me()
                backend.calls.append(status)
                if backend.reject_pending and status == 'pending':
                    raise ApiError(502, 'pending sync unavailable')
                if backend.reject_sync and status == 'success':
                    raise ApiError(502, 'sync unavailable')
                old = next((r for r in backend.rows if r['item_id'] == item_id and r['channel'] == channel), None)
                if status == 'running' and old and old['status'] in {'running', 'success'}:
                    raise ApiError(409, 'claimed')
                if status == 'pending' and old and old['status'] != 'pending' and old.get('updated_at') != expected_updated_at:
                    raise ApiError(409, 'stale claim')
                stamp = '2026-09-30T12:00:00.' + str(len(backend.calls)).zfill(6) + 'Z'
                if old:
                    old.update(status=status, goods_no=goods_no, updated_at=stamp)
                else:
                    old = {'item_id': item_id, 'channel': channel, 'status': status, 'goods_no': goods_no, 'updated_at': stamp}
                    backend.rows.append(old)
                return {'registration': copy.deepcopy(old)}
            def complete(self, _):
                self.me()
                return {'done': True}
        return Client()


class FakeEngine:
    submissions = 0
    ambiguous = False
    login = False
    changed_review = False
    def __init__(self, directory, ui):
        self.ui = ui
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass
    def prepare(self, item, channel):
        if self.login:
            self.ui.wait('waiting_login', 'login required')
        return item
    def review_changed(self, prepared):
        return self.changed_review
    def submit(self, prepared, item):
        type(self).submissions += 1
        return {'ok': True, 'goodsNo': None if self.ambiguous else '10001234', 'warnings': []}


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.backend = Backend()
        FakeEngine.submissions, FakeEngine.ambiguous, FakeEngine.login, FakeEngine.changed_review = 0, False, False, False
        self.manager = Manager(self.tmp.name, self.backend.client, FakeEngine)
        self.manager.connect(ORIGIN, 'test-access-token-not-secret')
    def tearDown(self):
        if self.manager.thread and self.manager.thread.is_alive():
            self.manager.control(self.manager.current()['id'], 'stop')
            self.manager.thread.join(3)
        self.tmp.cleanup()
    def body(self, dry=False, key='request-key-0001'):
        return {'listId': LIST, 'itemIds': [ITEM], 'channels': ['retail'], 'dryRun': dry, 'idempotencyKey': key}
    def wait(self, states):
        deadline = time.time() + 4
        while time.time() < deadline:
            job = self.manager.snapshot()['job']
            if job and job['state'] in states:
                return job
            time.sleep(.01)
        self.fail(str(self.manager.snapshot()))
    def test_success_idempotency_and_local_journal(self):
        first = self.manager.submit(ORIGIN, self.body())
        duplicate = self.manager.submit(ORIGIN, self.body())
        self.assertTrue(duplicate['duplicate'])
        self.assertEqual(first['job']['id'], duplicate['job']['id'])
        self.assertEqual(self.wait({'completed'})['success'], 1)
        self.assertEqual(FakeEngine.submissions, 1)
        journal = json.loads(Path(self.tmp.name, 'journal.json').read_text())
        self.assertEqual(journal['registrations'][ITEM + ':retail']['phase'], 'success')
        self.assertNotIn('test-access-token', json.dumps(journal))
        with self.assertRaises(ApiError):
            self.manager.submit(ORIGIN, {**self.body(), 'dryRun': True})
    def test_saved_but_sync_failed_is_not_retried(self):
        self.backend.reject_sync = True
        self.manager.submit(ORIGIN, self.body())
        self.wait({'needs_review'})
        self.assertEqual(FakeEngine.submissions, 1)
        self.assertNotIn('failed', self.backend.calls)
        saved = self.manager.data['registrations'][ITEM + ':retail']
        self.assertTrue(saved['savedEvidence'])
        self.assertEqual(saved['goodsNo'], '10001234')
        self.manager.submit(ORIGIN, self.body(key='new-request-key'))
        self.wait({'failed'})
        self.assertEqual(FakeEngine.submissions, 1)
    def test_ambiguous_save_blocks_retry(self):
        FakeEngine.ambiguous = True
        self.manager.submit(ORIGIN, self.body())
        self.wait({'needs_review'})
        self.assertEqual(self.backend.rows[0]['status'], 'running')
        self.assertNotIn('failed', self.backend.calls)
    def test_dry_run_waits_without_saving(self):
        self.manager.submit(ORIGIN, self.body(dry=True))
        waiting = self.wait({'waiting_review'})
        self.assertEqual(self.backend.calls, [])
        self.manager.control(waiting['id'], 'continue')
        self.assertEqual(self.wait({'completed'})['reviewed'], 1)
        self.assertEqual(FakeEngine.submissions, 0)
    def test_review_manual_navigation_requires_reconciliation(self):
        FakeEngine.changed_review = True
        self.manager.submit(ORIGIN, self.body(dry=True))
        waiting = self.wait({'waiting_review'})
        self.manager.control(waiting['id'], 'continue')
        self.wait({'needs_review'})
        self.assertEqual(FakeEngine.submissions, 0)
        self.assertEqual(self.backend.calls, [])
        self.assertTrue(self.manager.data['registrations'][ITEM + ':retail']['manualReviewChange'])
    def test_stop_login_releases_unsaved_claim(self):
        FakeEngine.login = True
        self.manager.submit(ORIGIN, self.body())
        waiting = self.wait({'waiting_login'})
        self.manager.control(waiting['id'], 'stop')
        self.assertTrue(self.wait({'completed'})['stopped'])
        self.assertEqual(FakeEngine.submissions, 0)
        self.assertEqual(self.backend.rows[0]['status'], 'pending')
    def test_waiting_job_uses_refreshed_session_after_continue(self):
        FakeEngine.login = True
        self.manager.submit(ORIGIN, self.body())
        waiting = self.wait({'waiting_login'})
        before = len(self.backend.tokens)
        refreshed = 'refreshed-access-token-for-test'
        self.manager.connect(ORIGIN, refreshed)
        self.manager.control(waiting['id'], 'continue')
        self.wait({'completed'})
        self.assertEqual(FakeEngine.submissions, 1)
        self.assertTrue(self.backend.tokens[before:])
        self.assertTrue(all(token == refreshed for token in self.backend.tokens[before:]))
    def test_worker_http_client_reads_current_token_for_every_request(self):
        import io
        seen = []
        class Transport:
            def open(self, request, timeout):
                seen.append(request.get_header('Authorization'))
                return io.BytesIO(b'{}')
        client = WorkerClient(ORIGIN, lambda: self.manager.token_for(ORIGIN))
        client.http = Transport()
        client.call('/api/me')
        self.manager.connect(ORIGIN, 'newly-refreshed-access-token')
        client.call('/api/me')
        self.assertEqual(seen, ['Bearer test-access-token-not-secret', 'Bearer newly-refreshed-access-token'])
    def test_stop_with_release_failure_preserves_review_state(self):
        FakeEngine.login = True
        self.backend.reject_pending = True
        self.manager.submit(ORIGIN, self.body())
        waiting = self.wait({'waiting_login'})
        self.manager.control(waiting['id'], 'stop')
        self.wait({'needs_review'})
        self.assertEqual(FakeEngine.submissions, 0)
        self.assertEqual(self.backend.rows[0]['status'], 'running')
        self.assertEqual(self.manager.data['registrations'][ITEM + ':retail']['phase'], 'needs_review')
    def test_changed_product_while_waiting_never_submits_old_values(self):
        FakeEngine.login = True
        self.manager.submit(ORIGIN, self.body())
        waiting = self.wait({'waiting_login'})
        self.backend.item['price_retail'] = 2000
        self.manager.control(waiting['id'], 'continue')
        failed = self.wait({'failed'})
        self.assertIn('상품 정보', failed['message'])
        self.assertEqual(FakeEngine.submissions, 0)
        self.assertEqual(self.backend.rows[0]['status'], 'pending')
        self.assertEqual(self.manager.data['registrations'][ITEM + ':retail']['phase'], 'cancelled')
    def test_channel_deselection_while_waiting_stops_before_save(self):
        FakeEngine.login = True
        self.manager.submit(ORIGIN, self.body())
        waiting = self.wait({'waiting_login'})
        self.backend.item['need_retail'] = '불필요'
        self.manager.control(waiting['id'], 'continue')
        self.wait({'failed'})
        self.assertEqual(FakeEngine.submissions, 0)
        self.assertEqual(self.backend.rows[0]['status'], 'pending')
    def test_done_change_while_waiting_stops_before_save(self):
        FakeEngine.login = True
        self.manager.submit(ORIGIN, self.body())
        waiting = self.wait({'waiting_login'})
        self.backend.item['done'] = True
        self.manager.control(waiting['id'], 'continue')
        self.wait({'failed'})
        self.assertEqual(FakeEngine.submissions, 0)
        self.assertEqual(self.backend.rows[0]['status'], 'pending')
    def test_existing_server_running_is_never_overwritten(self):
        self.backend.rows = [{'item_id': ITEM, 'channel': 'retail', 'status': 'running'}]
        self.manager.submit(ORIGIN, self.body())
        self.wait({'failed'})
        self.assertEqual(self.backend.calls, [])
        self.assertEqual(FakeEngine.submissions, 0)
    def test_recovery_marks_interrupted_journal_for_review(self):
        self.manager.data['jobs']['crashed'] = {'id': 'crashed', 'state': 'running'}
        self.manager.data['latest'] = 'crashed'
        self.manager.data['registrations'][ITEM + ':retail'] = {'phase': 'submitting'}
        self.manager.persist()
        recovered = Manager(self.tmp.name, self.backend.client, FakeEngine)
        self.assertEqual(recovered.current()['state'], 'needs_review')
        self.assertEqual(recovered.data['registrations'][ITEM + ':retail']['phase'], 'needs_review')
    def test_token_file_is_private_and_stable(self):
        first = pairing_token(self.tmp.name)
        self.assertEqual(first, pairing_token(self.tmp.name))
        self.assertGreaterEqual(len(first), 40)
        self.assertEqual(Path(self.tmp.name, 'connection-token').stat().st_mode & 0o777, 0o600)
    def test_origin_host_bearer_and_web_session(self):
        token = 'local-test-token'
        server = make_server(self.manager, token, {ORIGIN}, port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        def request(headers, method='GET'):
            conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=2)
            conn.request(method, '/status', headers=headers)
            res = conn.getresponse()
            result = res.status
            res.read()
            conn.close()
            return result
        good = {'Origin': ORIGIN, 'Authorization': 'Bearer ' + token}
        try:
            self.assertEqual(request(good), 200)
            self.assertEqual(request({**good, 'Origin': 'https://evil.example'}), 403)
            self.assertEqual(request({**good, 'Host': 'evil.example'}), 403)
            self.assertEqual(request({'Origin': ORIGIN}), 401)
            self.assertEqual(request({'Authorization': 'Bearer ' + token}), 403)
            self.backend.role = 'viewer'
            self.assertEqual(request(good), 403)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(2)


if __name__ == '__main__':
    unittest.main()
