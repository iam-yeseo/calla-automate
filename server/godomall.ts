import type { Channel, Product } from '../src/types';
import { MALLS, type GodomallOperation, type MallConnection, type OperationKind, type RemoteGoods } from '../src/godomall-types';
import { credentials, GodomallClient, sleep, type GodomallSecrets, type RateGate } from './godomall-client';
import { mismatches, prepareInsert, prepareUpdate, validateMallCodes, type InsertChoices } from './godomall-mapping';
import { canonicalXml, children, digest, GodomallError, value, type XmlNode } from './godomall-xml';
import { syncSummary, syncTaxonomy, type TaxonomyKind, type TaxonomySync } from './godomall-taxonomy';
import { resolveInsertDefaults } from './godomall-defaults';
import { describeInsertCodes, registrationPreview } from './godomall-preview';

// Data access is injected from the authenticated Worker BFF; no service key reaches the browser.
export type GodomallDb = (resource: string, query?: Record<string, string>, method?: string, payload?: unknown, prefer?: string) => Promise<{ data: any; headers: Headers }>;
export interface GodomallContext { env: GodomallSecrets; user: { id: string }; role: 'admin' | 'viewer'; fetch: typeof fetch; db: GodomallDb; readBody(): Promise<Record<string, unknown>>; publicOrigin: string }
interface StoredOperation extends GodomallOperation {
  target_key: string; created_by: string; source_revision: string | null; fingerprint: string | null;
  expected: Record<string, string>; payload_xml: string | null; payload_token_hash: string | null; payload_expires_at: string | null;
  acknowledged_goods_no: string | null;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const id = (input: unknown) => { if (typeof input !== 'string' || !UUID.test(input)) throw new GodomallError(422, '요청 식별자를 확인해 주세요.', 'invalid_id'); return input; };
const goodsId = (input: unknown) => { if (typeof input !== 'string' || !/^\d{1,20}$/.test(input)) throw new GodomallError(422, '상품번호는 숫자로 입력해 주세요.', 'invalid_goods_no'); return input; };
const mallId = (input: string): Channel => { if (input !== 'retail' && input !== 'wholesale') throw new GodomallError(422, '소매몰 또는 도매몰을 선택해 주세요.', 'invalid_mall'); return input; };
const administrator = (c: GodomallContext) => { if (c.role !== 'admin') throw new GodomallError(403, '관리자만 상품을 등록·수정할 수 있습니다.', 'admin_required'); };
const deletionDisabled = () => new GodomallError(403, '상품 삭제는 고도몰 관리자에서만 진행할 수 있습니다.', 'deletion_disabled');
export function publicOperation(op: StoredOperation, includePreview = true): GodomallOperation {
  return { id: op.id, mall_id: op.mall_id, kind: op.kind, state: op.state, item_id: op.item_id, goods_no: op.goods_no, title: op.title, marker: op.marker, changes: op.changes, ...(includePreview && op.kind === 'insert' ? { product_preview: registrationPreview(op) } : {}), warnings: op.warnings, error_message: op.error_message, response_code: op.response_code, created_at: op.created_at, updated_at: op.updated_at, checked_at: op.checked_at, expires_at: op.expires_at, verification_attempts: op.verification_attempts };
}
function gate(db: GodomallDb): RateGate {
  return {
    async reserve(mall) {
      const { data } = await db('rpc/godomall_reserve_call', {}, 'POST', { p_mall: mall });
      const wait = Date.parse(data) - Date.now();
      if (!Number.isFinite(wait)) throw new GodomallError(503, 'API 호출 제어 설정을 확인해 주세요.', 'rate_gate_unavailable');
      if (wait > 5000) throw new GodomallError(429, `고도몰 호출이 대기 중입니다. ${Math.ceil(wait / 1000)}초 후 다시 조회해 주세요.`, 'godomall_rate_limited', false, Math.ceil(wait / 1000));
      if (wait > 0) await sleep(wait);
    },
    async pause(mall, milliseconds) { await db('rpc/godomall_pause_calls', {}, 'POST', { p_mall: mall, p_milliseconds: milliseconds }); },
  };
}
async function cache(c: GodomallContext, mall: Channel, goods: RemoteGoods[], nodes: XmlNode[]) {
  if (!goods.length) return;
  await c.db('godomall_products', { on_conflict: 'mall_id,goods_no' }, 'POST', goods.map((g, i) => ({ mall_id: mall, goods_no: g.goodsNo, snapshot: g, raw_xml: canonicalXml(nodes[i]), checked_at: g.checkedAt, deleted: false })), 'resolution=merge-duplicates');
}
async function connection(c: GodomallContext, mall: Channel, check: boolean): Promise<MallConnection> {
  try { credentials(c.env, mall); }
  catch (error) { return { mallId: mall, configured: false, connected: false, checkedAt: null, message: (error as Error).message, code: 'godomall_configuration' }; }
  if (!check) {
    const { data } = await c.db('godomall_mall_state', { mall_id: `eq.${mall}`, select: 'connection_state,checked_at,message,error_code', limit: '1' });
    const state = data?.[0];
    return { mallId: mall, configured: true, connected: !state || state.connection_state === 'unchecked' ? null : state.connection_state === 'connected', checkedAt: state?.checked_at || null, message: state?.message || '실제 조회로 연결을 확인해 주세요.', code: state?.error_code || undefined };
  }
  const checkedAt = new Date().toISOString(); let result: MallConnection;
  try { await new GodomallClient(c.env, mall, c.fetch, gate(c.db)).search({ page: '1', size: '1' }); result = { mallId: mall, configured: true, connected: true, checkedAt, message: '고도몰 상품 조회 응답을 확인했습니다.' }; }
  catch (error) { result = { mallId: mall, configured: true, connected: false, checkedAt, message: error instanceof GodomallError ? error.message : '고도몰에 연결하지 못했습니다.', code: error instanceof GodomallError ? error.code : 'connection_failed' }; }
  await c.db('godomall_mall_state', { mall_id: `eq.${mall}` }, 'PATCH', { connection_state: result.connected ? 'connected' : 'error', checked_at: checkedAt, message: result.message, error_code: result.code || null });
  return result;
}
async function operation(c: GodomallContext, mall: Channel, operationId: string): Promise<StoredOperation> {
  const { data } = await c.db('godomall_operations', { id: `eq.${id(operationId)}`, mall_id: `eq.${mall}`, select: '*', limit: '1' });
  if (!data?.[0]) throw new GodomallError(404, '해당 몰의 작업을 찾을 수 없습니다.', 'operation_not_found');
  return data[0];
}
async function patchOperation(c: GodomallContext, op: StoredOperation, patch: Partial<StoredOperation>): Promise<StoredOperation> {
  const { data } = await c.db('godomall_operations', { id: `eq.${op.id}`, state: 'in.(sending,verifying,needs_review)' }, 'PATCH', { ...patch, updated_at: new Date().toISOString() }, 'return=representation');
  return data?.[0] || operation(c, op.mall_id, op.id);
}
async function finish(c: GodomallContext, op: StoredOperation, state: 'success' | 'failed' | 'needs_review', message: string | null, goods?: RemoteGoods, node?: XmlNode) {
  const { data } = await c.db('rpc/godomall_finish_operation', {}, 'POST', { p_id: op.id, p_state: state, p_goods_no: goods?.goodsNo || op.goods_no, p_error: message, p_snapshot: goods || null, p_raw_xml: node ? canonicalXml(node) : null });
  return data as StoredOperation;
}
async function verify(c: GodomallContext, original: StoredOperation, client: GodomallClient): Promise<StoredOperation> {
  let op = original;
  if (['success', 'failed', 'prepared'].includes(op.state)) return op;
  // A second process must not verify a request which could still be running upstream.
  if (op.state === 'sending' && Date.now() - Date.parse(op.updated_at) < 60000) throw new GodomallError(409, '아직 고도몰 요청 처리 중입니다. 1분 후 작업 이력에서 확인해 주세요.', 'operation_in_flight');
  if (op.kind === 'delete') {
    if (op.response_code === '000' && op.acknowledged_goods_no === op.goods_no) return finish(c, op, 'success', null);
    return finish(c, op, 'needs_review', '삭제 성공 응답과 대상 상품번호를 확인하지 못했습니다. 검색 결과가 없어도 완료로 처리하지 않습니다. 해당 몰의 삭제상품관리에서 확인해 주세요.');
  }
  op = await patchOperation(c, op, { state: 'verifying' });
  let reason = '실제 상품을 확인하지 못했습니다.';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(attempt * 750);
    op = await patchOperation(c, op, { verification_attempts: op.verification_attempts + 1 });
    try {
      let candidate: { goods: RemoteGoods; node: XmlNode };
      if (op.goods_no) candidate = await client.get(op.goods_no);
      else {
        if (!op.marker) break;
        const found = await client.search({ goodsCd: op.marker, page: '1', size: '100' });
        const matches = found.nodes.map((node, i) => ({ node, goods: found.page.goods[i] })).filter(row => value(row.node, 'goodsCd') === op.marker);
        if (matches.length !== 1 || found.page.hasNext) { reason = matches.length > 1 || found.page.hasNext ? '고유 등록코드의 조회 결과가 여러 건입니다. 자동으로 연결하지 않습니다.' : '고유 등록코드로 아직 상품을 확인하지 못했습니다.'; continue; }
        candidate = matches[0];
      }
      if (op.kind === 'insert' && value(candidate.node, 'goodsCd') !== op.marker) { reason = '응답 상품번호의 고유 등록코드가 일치하지 않습니다.'; continue; }
      const differences = mismatches(op.expected, candidate.node);
      if (differences.length) { reason = `재조회 내용이 아직 일치하지 않습니다: ${differences.join(', ')}`; continue; }
      return finish(c, op, 'success', null, candidate.goods, candidate.node);
    } catch (error) {
      reason = error instanceof GodomallError ? error.message : '상품 재조회 중 통신 오류가 발생했습니다.';
      if (error instanceof GodomallError && ['godomall_rate_limited', 'godomall_auth', 'godomall_permission', 'godomall_configuration'].includes(error.code)) break;
    }
  }
  return finish(c, op, 'needs_review', reason);
}
async function prepare(c: GodomallContext, mall: Channel, input: Record<string, unknown>, client: GodomallClient) {
  if (input.kind === 'delete') throw deletionDisabled();
  if (!['insert', 'update'].includes(String(input.kind))) throw new GodomallError(422, '작업 유형을 확인해 주세요.', 'invalid_operation');
  credentials(c.env, mall);
  const kind = input.kind as OperationKind, opId = crypto.randomUUID();
  let itemId: string | null = null, goodsNo: string | null = null, title = '', fingerprint: string | null = null, revision: string | null = null;
  let xml: string | null = null, expected: Record<string, string> = {}, changes: GodomallOperation['changes'] = [], warnings: string[] = [];
  const marker = kind === 'insert' ? `CA_${opId.replaceAll('-', '').slice(0, 27)}` : null;
  if (kind === 'insert') {
    itemId = id(input.itemId);
    const { data } = await c.db('product_items', { id: `eq.${itemId}`, select: '*', limit: '1' });
    const product = data?.[0] as Product | undefined;
    if (!product) throw new GodomallError(404, '저장된 상품을 찾을 수 없습니다.', 'item_not_found');
    if (product[`need_${mall}`] !== '필요') throw new GodomallError(422, '선택한 몰의 등록 필요 여부를 먼저 설정하고 저장해 주세요.', 'mall_not_requested');
    const [registrations, links, active] = await Promise.all([
      c.db('product_registrations', { item_id: `eq.${itemId}`, channel: `eq.${mall}`, select: '*', limit: '1' }),
      c.db('godomall_links', { item_id: `eq.${itemId}`, mall_id: `eq.${mall}`, select: '*', limit: '1' }),
      c.db('godomall_operations', { mall_id: `eq.${mall}`, target_key: `eq.item:${itemId}`, state: 'in.(sending,verifying,needs_review)', select: 'id', limit: '1' }),
    ]);
    const reg = registrations.data?.[0], link = links.data?.[0];
    if (active.data?.length || (reg && (reg.goods_no || ['success', 'running'].includes(reg.status)) && link?.api_state !== 'deleted')) throw new GodomallError(409, '이미 등록되었거나 결과 확인이 필요한 상품입니다. 작업 이력에서 기존 결과를 확인해 주세요.', 'registration_conflict');
    const raw = input.choices;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new GodomallError(422, '몰별 등록 설정을 선택해 주세요.', 'choices_required');
    const choices = raw as Record<string, unknown>;
    if (typeof choices.brandCd !== 'string' || choices.brandCd.length > 30) throw new GodomallError(422, '몰별 코드 설정을 확인해 주세요.', 'invalid_code');
    const defaults = await resolveInsertDefaults(client);
    // Shipping and guides are server-owned defaults, including for legacy clients
    // that still submit a deliverySno or guide-code override.
    const mapped = prepareInsert(product, mall, marker!, { brandCd: choices.brandCd, scmNo: '1', ...defaults } as InsertChoices);
    const codes = await validateMallCodes(client, Object.fromEntries(mapped.node.children.filter(n => !n.children.length).map(n => [n.name, n.text])));
    title = product.name_own; revision = product.updated_at || null;
    if (!revision) throw new GodomallError(409, '상품 저장 버전을 확인할 수 없습니다. 상품을 저장한 뒤 다시 열어 주세요.', 'source_revision_required');
    ({ xml, expected, changes, warnings } = mapped);
    changes = describeInsertCodes(changes, codes, mall);
  } else {
    goodsNo = goodsId(input.goodsNo);
    const remote = await client.get(goodsNo); title = remote.goods.name || goodsNo; fingerprint = remote.goods.fingerprint;
    await cache(c, mall, [remote.goods], [remote.node]);
    if (typeof input.fingerprint !== 'string' || input.fingerprint !== fingerprint) throw new GodomallError(409, '상품이 변경되었습니다. 최신 상세정보를 다시 조회한 뒤 검토해 주세요.', 'remote_changed');
    if (kind === 'update') {
      const mapped = prepareUpdate(remote.node, input.changes); await validateMallCodes(client, mapped.fields, mapped.before);
      ({ xml, expected, changes, warnings } = mapped);
    } else changes = [{ field: 'deleted', label: '처리 내용', before: '등록 상품', after: '삭제상품관리로 이동' }];
    const linked = await c.db('godomall_links', { mall_id: `eq.${mall}`, goods_no: `eq.${goodsNo}`, select: 'item_id', limit: '2' });
    if (linked.data?.length === 1) itemId = linked.data[0].item_id;
  }
  const now = new Date().toISOString();
  const row = { id: opId, mall_id: mall, kind, state: 'prepared', item_id: itemId, goods_no: goodsNo, title, marker, target_key: kind === 'insert' ? `item:${itemId}` : `goods:${goodsNo}`, created_by: c.user.id, source_revision: revision, fingerprint, changes, warnings, expected, payload_xml: xml, created_at: now, updated_at: now, expires_at: new Date(Date.now() + 20 * 60000).toISOString() };
  const { data } = await c.db('godomall_operations', {}, 'POST', row, 'return=representation');
  return data[0] as StoredOperation;
}
async function execute(c: GodomallContext, op: StoredOperation, client: GodomallClient) {
  if (op.kind === 'delete') throw deletionDisabled();
  if (op.created_by !== c.user.id) throw new GodomallError(403, '검토를 요청한 관리자만 실행할 수 있습니다.', 'operation_owner');
  if (op.state !== 'prepared') return op; // Repeated confirmation is an idempotent read, never another remote request.
  if (Date.parse(op.expires_at) < Date.now()) throw new GodomallError(409, '검토 시간이 만료되었습니다. 변경사항을 다시 검토해 주세요.', 'preview_expired');
  if (op.kind === 'insert' && op.expected.imageStorage !== 'local') throw new GodomallError(409, '상품 이미지 저장 방식이 변경되었습니다. 등록 전 검토를 다시 열어 주세요.', 'image_storage_changed');
  credentials(c.env, op.mall_id);
  if (op.kind !== 'insert') {
    const latest = await client.get(op.goods_no!);
    if (latest.goods.fingerprint !== op.fingerprint) throw new GodomallError(409, '검토 후 고도몰 상품이 변경되었습니다. 최신 내용으로 다시 검토해 주세요.', 'remote_changed');
  }
  const publicUrl = new URL(c.publicOrigin);
  if (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password) throw new GodomallError(503, '공개 HTTPS API 주소 설정이 필요합니다.', 'payload_origin_required');
  const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const claimed = await c.db('rpc/godomall_begin_operation', {}, 'POST', { p_id: op.id, p_actor: c.user.id, p_token_hash: await digest(token) });
  if (!claimed.data.started) return claimed.data.operation as StoredOperation;
  op = claimed.data.operation;
  let response;
  try {
    response = await client.call(op.kind as 'insert' | 'update', { data_url: `${publicUrl.origin}/api/godomall/payloads/${op.id}/${token}.xml` });
  } catch (error) {
    if (error instanceof GodomallError && !error.uncertain) return finish(c, op, 'failed', error.message);
    // Store uncertainty first so loss of the caller's connection cannot turn into a retry.
    op = await finish(c, op, 'needs_review', error instanceof GodomallError ? error.message : '처리 응답을 확인하지 못했습니다.');
    return op.kind === 'insert' ? verify(c, op, client) : op;
  }
  const resultRows = children(response.data, 'goods_data');
  const rowFailure = resultRows.map(row => value(row, 'code')).find(code => code !== null && code !== '000');
  if (rowFailure) return finish(c, op, 'needs_review', '전체 응답과 상품별 처리 결과가 다릅니다. 실제 결과를 확인해 주세요.');
  const ack = resultRows.length === 1 ? value(resultRows[0], 'goodsNo') : value(response.data, 'goodsNo');
  const acknowledged = ack && /^\d{1,20}$/.test(ack) ? ack : null;
  if (op.kind !== 'insert' && acknowledged && acknowledged !== op.goods_no) return finish(c, op, 'needs_review', '응답의 상품번호가 요청 대상과 다릅니다.');
  op = await patchOperation(c, op, { state: 'verifying', response_code: response.code, acknowledged_goods_no: acknowledged, ...(op.kind === 'insert' && acknowledged ? { goods_no: acknowledged } : {}) });
  return verify(c, op, client);
}
export async function godomallPayload(request: Request, db: GodomallDb): Promise<Response> {
  const match = new URL(request.url).pathname.match(/^\/api\/godomall\/payloads\/([0-9a-f-]{36})\/([0-9a-f]{64})\.xml$/);
  if (!match || !UUID.test(match[1]) || request.method !== 'GET') return new Response('Not found', { status: 404 });
  const { data } = await db('godomall_operations', { id: `eq.${match[1]}`, payload_token_hash: `eq.${await digest(match[2])}`, payload_expires_at: `gt.${new Date().toISOString()}`, state: 'in.(sending,verifying)', select: 'payload_xml', limit: '1' });
  if (!data?.[0]?.payload_xml) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  return new Response(data[0].payload_xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'no-store, private', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox", 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow' } });
}
export async function godomallRoute(c: GodomallContext, path: string, method: string, url: URL): Promise<Response | null> {
  if (!path.startsWith('/api/godomall/')) return null;
  if (path === '/api/godomall/connections' && method === 'GET') return json({ connections: await Promise.all((['retail', 'wholesale'] as const).map(m => connection(c, m, false))) });
  const match = path.match(/^\/api\/godomall\/(retail|wholesale)\/(.*)$/);
  if (!match) throw new GodomallError(404, '고도몰 API 경로를 찾을 수 없습니다.', 'not_found');
  const mall = mallId(match[1]), rest = match[2], client = new GodomallClient(c.env, mall, c.fetch, gate(c.db));
  if (rest === 'connection' && method === 'GET') return json({ connection: await connection(c, mall, true) });
  if (rest === 'taxonomy' && method === 'GET') {
    const { data } = await c.db('godomall_taxonomy_sync', { mall_id: `eq.${mall}`, select: '*' });
    return json({ syncs: (data || []).map((row: TaxonomySync) => syncSummary(row)) });
  }
  const taxonomy = rest.match(/^taxonomy\/(categories|brands)\/sync$/);
  if (taxonomy && method === 'POST') {
    administrator(c); const input = await c.readBody();
    return json({ sync: await syncTaxonomy(c.db, client, taxonomy[1] as TaxonomyKind, input.restart === true) });
  }
  if (rest === 'codes' && method === 'GET') return json({ codes: await client.codes(url.searchParams.get('kind') || '', url.searchParams.get('parent') || '') });
  if (rest === 'goods' && method === 'GET') {
    const params: Record<string, string> = { page: url.searchParams.get('page') || '1', size: url.searchParams.get('size') || '50' };
    const search = url.searchParams.get('q')?.trim(), field = url.searchParams.get('field') || 'goodsNm';
    if (!['goodsNm', 'goodsNo', 'goodsModelNo', 'goodsCd'].includes(field) || (search?.length || 0) > 250) throw new GodomallError(422, '검색 조건을 확인해 주세요.', 'invalid_search');
    if (search) params[field] = field === 'goodsNo' ? goodsId(search) : search;
    const found = await client.search(params); await cache(c, mall, found.page.goods, found.nodes);
    await c.db('godomall_mall_state', { mall_id: `eq.${mall}` }, 'PATCH', { connection_state: 'connected', checked_at: found.page.checkedAt, message: '상품 조회 응답 확인', error_code: null });
    return json(found.page);
  }
  const detail = rest.match(/^goods\/(\d{1,20})$/);
  if (detail && method === 'GET') {
    const found = await client.get(detail[1]); await cache(c, mall, [found.goods], [found.node]);
    await c.db('godomall_links', { mall_id: `eq.${mall}`, goods_no: `eq.${detail[1]}`, api_state: 'eq.unknown', last_operation_id: 'is.null' }, 'PATCH', { api_state: 'verified', checked_at: found.goods.checkedAt, error_message: null, updated_at: found.goods.checkedAt });
    const { data: links } = await c.db('godomall_links', { mall_id: `eq.${mall}`, goods_no: `eq.${detail[1]}`, select: '*' });
    return json({ goods: found.goods, links });
  }
  if (rest === 'operations' && method === 'GET') {
    const offset = Number(url.searchParams.get('offset') || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new GodomallError(422, '페이지를 확인해 주세요.', 'invalid_pagination');
    const query: Record<string, string> = { mall_id: `eq.${mall}`, select: '*', order: 'created_at.desc,id.desc', limit: '50', offset: String(offset) };
    if (url.searchParams.has('itemId')) query.item_id = `eq.${id(url.searchParams.get('itemId'))}`;
    if (url.searchParams.has('goodsNo')) query.goods_no = `eq.${goodsId(url.searchParams.get('goodsNo'))}`;
    // The dialog reads one operation when opened. Avoid duplicating up to fifty
    // pairs of full detail HTML documents in this history-list response.
    const { data } = await c.db('godomall_operations', query); return json({ operations: (data || []).map((row: StoredOperation) => publicOperation(row, false)), nextOffset: data?.length === 50 ? offset + 50 : null });
  }
  if (rest === 'operations/prepare' && method === 'POST') { administrator(c); return json({ operation: publicOperation(await prepare(c, mall, await c.readBody(), client)) }, 201); }
  const action = rest.match(/^operations\/([0-9a-f-]{36})(?:\/(execute|verify))?$/);
  if (action) {
    if (method !== 'GET') administrator(c);
    const op = await operation(c, mall, action[1]);
    if (!action[2] && method === 'GET') return json({ operation: publicOperation(op) });
    if (action[2] === 'execute' && method === 'POST') {
      const input = await c.readBody(); if (input.confirmed !== true) throw new GodomallError(422, '대상 몰과 변경사항 확인이 필요합니다.', 'confirmation_required');
      return json({ operation: publicOperation(await execute(c, op, client)) });
    }
    if (action[2] === 'verify' && method === 'POST') return json({ operation: publicOperation(await verify(c, op, client)) });
  }
  throw new GodomallError(404, '고도몰 API 경로를 찾을 수 없습니다.', 'not_found');
}
