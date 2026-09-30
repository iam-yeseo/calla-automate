
type Row = Record<string, any>;
type Role = 'admin' | 'viewer';
type Context = { env: Env; request: Request; fetch: typeof fetch; user: { id: string; email: string }; role: Role };
class ApiError extends Error { constructor(public status: number, message: string, public code = 'request_failed') { super(message); } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHANNELS = ['retail', 'wholesale'] as const;
const MAX_JSON = 4 * 1024 * 1024;
const MAX_FILE = 6 * 1024 * 1024;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
function fail(status: number, message: string, code?: string): never { throw new ApiError(status, message, code); }
function object(value: unknown, name = '요청'): Row { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(422, `${name} 형식이 올바르지 않습니다.`, 'invalid_payload'); return value as Row; }
function uuid(value: unknown, name = 'ID'): string { if (typeof value !== 'string' || !UUID.test(value)) fail(422, `${name} 형식이 올바르지 않습니다.`, 'invalid_uuid'); return value; }
function string(value: unknown, name: string, max = 2000, fallback = ''): string { if (value === undefined || value === null) return fallback; if (typeof value !== 'string' || value.length > max) fail(422, `${name}은 ${max}자 이내 문자열이어야 합니다.`, 'invalid_field'); return value; }
function array(value: unknown, name: string, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) fail(422, `${name} 형식 또는 최대 개수를 확인해 주세요.`, 'invalid_array'); return value; }
function admin(c: Context) { if (c.role !== 'admin') fail(403, '관리자 권한이 필요합니다.', 'admin_required'); }
function config(env: Env, service = false) {
  const url = env.SUPABASE_URL, key = env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || (service && !env.SUPABASE_SERVICE_ROLE_KEY)) fail(503, '서버의 Supabase 연결 설정이 필요합니다.', 'configuration_required');
  if (key.startsWith('sb_secret_') || key === env.SUPABASE_SERVICE_ROLE_KEY) fail(503, '공개용 Supabase 키 설정을 확인해 주세요.', 'configuration_required');
  if (key.split('.').length === 3) { try { const encoded = key.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'); if (JSON.parse(atob(encoded)).role === 'service_role') fail(503, '공개용 Supabase 키 설정을 확인해 주세요.', 'configuration_required'); } catch (error) { if (error instanceof ApiError) throw error; } }
  let parsed: URL; try { parsed = new URL(url); } catch { fail(503, 'Supabase URL 설정이 올바르지 않습니다.', 'configuration_required'); }
  if (parsed!.protocol !== 'https:' || parsed!.username || parsed!.password || parsed!.search || parsed!.hash) fail(503, 'Supabase URL 설정이 올바르지 않습니다.', 'configuration_required');
  return { url: parsed!.origin, key };
}
async function boundedBody(request: Request, limit: number) {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) fail(413, '요청 크기가 너무 큽니다.', 'body_too_large');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) { await reader.cancel(); fail(413, '요청 크기가 너무 큽니다.', 'body_too_large'); } parts.push(value); } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; } return bytes;
}
async function body(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail(415, 'JSON 요청이 필요합니다.', 'unsupported_content_type');
  const bytes = await boundedBody(request, MAX_JSON); try { return object(JSON.parse(new TextDecoder().decode(bytes))); } catch (error) { if (error instanceof ApiError) throw error; fail(400, 'JSON 형식을 확인해 주세요.', 'invalid_json'); }
}
async function auth(request: Request, env: Env, fetcher: typeof fetch): Promise<Context> {
  const { url, key } = config(env);
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer [^\s]{1,8192}$/.test(authorization)) fail(401, '로그인이 필요합니다.', 'authentication_required');
  const res = await fetcher(`${url}/auth/v1/user`, { headers: { apikey: key, authorization }, signal: AbortSignal.timeout(15000) });
  if (res.status === 401 || res.status === 403) fail(401, '로그인이 만료되었습니다. 다시 로그인해 주세요.', 'authentication_required');
  if (!res.ok) fail(502, '로그인 상태를 확인하지 못했습니다.', 'auth_unavailable');
  const value = object(await res.json()); const id = uuid(value.id, '사용자 ID');
  const email = typeof value.email === 'string' ? value.email : '';
  const role = value.app_metadata?.calla_role;
  const approved = (env.ADMIN_EMAILS || '').split(',').map((v: string) => v.trim().toLowerCase()).filter(Boolean);
  const override = Boolean(value.email_confirmed_at) && approved.includes(email.toLowerCase());
  const resolved = override ? 'admin' : role;
  if (resolved !== 'admin' && resolved !== 'viewer') fail(403, '이 작업 공간에 등록된 사용자만 접근할 수 있습니다.', 'membership_required');
  return { env, request, fetch: fetcher, user: { id, email }, role: resolved };
}
async function db(c: Context, resource: string, query: Record<string, string> = {}, method = 'GET', payload?: unknown, prefer?: string) {
  const { url } = config(c.env, true); const target = new URL(`${url}/rest/v1/${resource}`);
  for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value);
  const headers: Record<string, string> = { apikey: c.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' };
  if (prefer) headers.prefer = prefer;
  const response = await c.fetch(target.toString(), { method, headers, signal: AbortSignal.timeout(20000), ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}) });
  if (!response.ok) { const error = await response.json().catch(() => ({})) as Row; if (error.code === '23505') fail(409, '이미 존재하는 데이터와 충돌했습니다.', 'conflict'); fail(502, '데이터베이스 요청을 완료하지 못했습니다.', 'database_error'); }
  const data: any = response.status === 204 ? null : await response.json().catch(() => null);
  return { data, headers: response.headers };
}
async function allRows(c: Context, table: string, query: Record<string, string>) {
  const result: Row[] = [];
  for (let offset = 0; offset < 100_000; offset += 1000) { const { data } = await db(c, table, { ...query, limit: '1000', offset: String(offset) }); const rows = Array.isArray(data) ? data : []; result.push(...rows); if (rows.length < 1000) return result; }
  fail(503, '목록 집계 범위를 초과했습니다. 관리자에게 문의해 주세요.', 'result_limit');
}
async function one(c: Context, table: string, id: string) { const { data } = await db(c, table, { id: `eq.${id}`, select: '*', limit: '1' }); if (!Array.isArray(data) || !data[0]) fail(404, '데이터를 찾을 수 없습니다.', 'not_found'); return data[0] as Row; }
async function settings(c: Context) { const { data } = await db(c, 'app_settings', { key: 'eq.product_automation_v1', select: 'value,updated_at', limit: '1' }); if (!Array.isArray(data) || !data[0]) fail(503, '상품 자동화 설정이 없습니다.', 'settings_missing'); return data[0] as { value: Row; updated_at: string }; }
async function registrations(c: Context, listId: string) { return allRows(c, 'product_registrations', { select: 'item_id,channel,status,goods_no,error_message,warnings,attempted_at,updated_at,product_items!inner(list_id)', 'product_items.list_id': `eq.${listId}`, order: 'item_id,channel' }); }
function listInput(input: Row, current?: Row) {
  const title = string(input.title, '리스트 이름', 200, current?.title || '').trim(); if (!title) fail(422, '리스트 이름을 입력해 주세요.', 'title_required');
  const date = string(input.work_date, '작성일', 10, current?.work_date || new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) fail(422, '작성일을 확인해 주세요.', 'invalid_date');
  return { ...(current?.id ? { id: current.id } : {}), title, author: string(input.author, '작성자', 100, current?.author || ''), work_date: date, note: string(input.note, '리스트 메모', 10000, current?.note || '') };
}
const textFields: Record<string, number> = { brand: 200, name_own: 20000, name_naver: 2000, model: 1000, content: 100000, image_usage: 10000, image_url: 4000, ref_link: 4000, note: 10000 };
const prices = ['price_retail_regular', 'price_retail', 'price_wholesale', 'price_wholesale_master', 'price_naver'];
function httpUrl(value: string, label: string) { if (!value) return; let u: URL; try { u = new URL(value); } catch { fail(422, `${label} 주소를 확인해 주세요.`, 'invalid_url'); } if (!['https:', 'http:'].includes(u!.protocol) || u!.username || u!.password) fail(422, `${label} 주소를 확인해 주세요.`, 'invalid_url'); }
function itemInput(value: unknown, listId: string, seq: number, old?: Row): Row {
  const source = object(value, '상품'); const id = uuid(source.id, '상품 ID');
  if (source.list_id !== undefined && source.list_id !== listId) fail(422, '다른 리스트의 상품은 저장할 수 없습니다.', 'item_ownership');
  const out: Row = { id, list_id: listId, seq };
  for (const [field, max] of Object.entries(textFields)) out[field] = string(source[field], field, max, old?.[field] || '');
  httpUrl(out.image_url, '썸네일'); httpUrl(out.ref_link, '참고 링크');
  for (const channel of ['retail', 'wholesale', 'naver']) { const key = `need_${channel}`; const value = source[key] ?? old?.[key] ?? (channel === 'naver' ? '불필요' : '필요'); if (!['필요', '불필요', ''].includes(value)) fail(422, '등록 필요 여부를 확인해 주세요.', 'invalid_need'); out[key] = value; }
  for (const key of prices) { const value = source[key] === undefined ? old?.[key] ?? null : source[key]; if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000_000)) fail(422, '가격은 0 이상의 정수 또는 빈 값이어야 합니다.', 'invalid_price'); out[key] = value; }
  const previous = old?.automation && typeof old.automation === 'object' ? old.automation : {};
  const incoming = source.automation === undefined ? previous : object(source.automation, '자동화 설정');
  const auto: Row = { ...previous, ...incoming, schemaVersion: 1 };
  const codes = object(auto.categoryCodes || {}, '카테고리'); auto.categoryCodes = { ...codes };
  for (const ch of CHANNELS) { const code = string(codes[ch], '카테고리 코드', 12); if (code && !/^(?:\d{3}){1,4}$/.test(code)) fail(422, '카테고리 코드는 3·6·9·12자리 문자열이어야 합니다.', 'invalid_category'); auto.categoryCodes[ch] = code; }
  auto.origin = string(auto.origin, '원산지', 200);
  auto.detailHtml = string(auto.detailHtml, '상세 HTML', 300000);
  auto.detailImages = array(auto.detailImages || [], '상세 이미지', 50).map(value => { const image = object(value, '상세 이미지'); for (const key of ['id', 'folder', 'filename']) if (image[key] !== undefined) string(image[key], key, key === 'filename' ? 500 : 200); if (image.url) httpUrl(string(image.url, '이미지 URL', 4000), '이미지'); return image; });
  if (source.image_url === '' && !Object.hasOwn(incoming, 'thumbnail')) delete auto.thumbnail;
  if (auto.thumbnail === null) delete auto.thumbnail;
  if (auto.thumbnail !== undefined) { object(auto.thumbnail, '썸네일'); if (auto.thumbnail.path !== undefined) string(auto.thumbnail.path, '썸네일 경로', 1000); }
  if (JSON.stringify(auto).length > 500000) fail(422, '상품 자동화 정보가 너무 큽니다.', 'invalid_automation');
  out.automation = auto; // Completion fields and UI-only fields are deliberately omitted.
  return out;
}
export function validateSettings(value: unknown): Row {
  const v = object(value, '설정'); if (v.schemaVersion !== undefined && v.schemaVersion !== 1) fail(422, '지원하지 않는 설정 버전입니다.', 'invalid_settings_version'); const cats = object(v.categories, '카테고리');
  const folders = array(v.folders, '폴더', 1000).map(x => string(x, '폴더', 100));
  if (new Set(folders).size !== folders.length || folders.some(x => !/^[a-z0-9][a-z0-9_-]*$/.test(x))) fail(422, '폴더 이름과 중복을 확인해 주세요.', 'invalid_folders');
  for (const ch of CHANNELS) { const rows = array(cats[ch], `${ch} 카테고리`, 5000).map(x => object(x, '카테고리')); const codes = new Set<string>(); for (const r of rows) { const code = string(r.code, '카테고리 코드', 12); if (!/^(?:\d{3}){1,4}$/.test(code) || codes.has(code) || !string(r.name, '카테고리 이름', 200).trim()) fail(422, '카테고리 이름·코드·중복을 확인해 주세요.', 'invalid_categories'); codes.add(code); if (r.folder && !folders.includes(r.folder)) fail(422, '카테고리의 이미지 폴더가 없습니다.', 'invalid_categories'); if (r.active !== undefined && typeof r.active !== 'boolean') fail(422, '카테고리 사용 상태를 확인해 주세요.', 'invalid_categories'); } for (const r of rows) { const parent = r.code.slice(0, -3); if ((r.parentCode || '') !== parent || (parent && !codes.has(parent))) fail(422, '상위 카테고리 코드를 확인해 주세요.', 'invalid_categories'); } }
  const brands = array(v.brands || [], '브랜드', 1000).map(x => object(x, '브랜드')); const names = new Set<string>(), codes = new Set<string>();
  for (const b of brands) { const name = string(b.name, '브랜드 이름', 30).trim(), key = name.toLowerCase().replace(/[^a-z0-9ㄱ-ㅎ가-힣]/g, ''); if (!name || names.has(key)) fail(422, '브랜드 이름 또는 중복을 확인해 주세요.', 'invalid_brands'); names.add(key); const code = string(b.code, '브랜드 코드', 20); if (code && (!/^[A-Za-z0-9_-]+$/.test(code) || codes.has(code))) fail(422, '브랜드 코드를 확인해 주세요.', 'invalid_brands'); if (code) codes.add(code); if (b.aliases !== undefined) array(b.aliases, '브랜드 검색 별칭', 30).forEach(x => string(x, '별칭', 30)); }
  return v;
}
async function route(c: Context, path: string, method: string, url: URL): Promise<Response> {
  if (path === '/api/me' && method === 'GET') return json({ user: c.user, role: c.role });
  if (path === '/api/lists' && method === 'GET') {
    const [lists, items, regs] = await Promise.all([allRows(c, 'product_lists', { select: '*', order: 'created_at.desc' }), allRows(c, 'product_items', { select: 'id,list_id,done,need_retail,need_wholesale', order: 'id' }), allRows(c, 'product_registrations', { select: 'item_id,channel,status', order: 'id' })]);
    const byItem = new Map(items.map(x => [x.id, x])); const totals = new Map<string, Row>();
    const empty = () => ({ total: 0, doneCount: 0, retailSuccess: 0, wholesaleSuccess: 0, retailTotal: 0, wholesaleTotal: 0, runningCount: 0, failedCount: 0 });
    for (const it of items) { if (!totals.has(it.list_id)) totals.set(it.list_id, empty()); const t = totals.get(it.list_id)!; t.total++; if (it.done) t.doneCount++; for (const ch of CHANNELS) if (it[`need_${ch}`] === '필요') t[`${ch}Total`]++; }
    for (const r of regs) { const it = byItem.get(r.item_id); const t = it ? totals.get(it.list_id) : undefined; if (!t) continue; if (r.status === 'success' && CHANNELS.includes(r.channel) && it![`need_${r.channel}`] === '필요') t[`${r.channel}Success`]++; if (r.status === 'running') t.runningCount++; if (r.status === 'failed') t.failedCount++; }
    return json({ lists: lists.map(l => ({ ...l, ...(totals.get(l.id) || empty()) })) });
  }
  if (path === '/api/lists' && method === 'POST') { admin(c); const payload = listInput(await body(c.request)); const { data } = await db(c, 'product_lists', {}, 'POST', payload, 'return=representation'); return json({ list: data?.[0] }, 201); }
  const listRoute = path.match(/^\/api\/lists\/([^/]+)(?:\/(items|draft|registrations))?$/);
  if (listRoute) {
    const id = uuid(listRoute[1], '리스트 ID'); const sub = listRoute[2];
    if (method === 'GET' && !sub) return json({ list: await one(c, 'product_lists', id) });
    if (method === 'DELETE' && !sub) { admin(c); await one(c, 'product_lists', id); await db(c, 'product_lists', { id: `eq.${id}` }, 'DELETE'); return json({ ok: true }); }
    if (method === 'GET' && sub === 'items') { await one(c, 'product_lists', id); return json({ items: await allRows(c, 'product_items', { list_id: `eq.${id}`, select: '*', order: 'seq.asc,created_at.asc,id.asc' }) }); }
    if (method === 'GET' && sub === 'registrations') { await one(c, 'product_lists', id); return json({ registrations: await registrations(c, id) }); }
    if (method === 'PUT' && sub === 'draft') {
      admin(c); const input = await body(c.request), current = await one(c, 'product_lists', id), list = object(input.list, '리스트');
      if (list.id !== undefined && list.id !== id) fail(422, '리스트 ID가 일치하지 않습니다.', 'list_ownership');
      const original = await allRows(c, 'product_items', { list_id: `eq.${id}`, select: '*', order: 'id' }); const byId = new Map(original.map(x => [x.id, x]));
      const raw = array(input.items, '상품', 500), removed = array(input.removedIds || [], '삭제 상품', 500).map(x => uuid(x, '삭제 상품 ID'));
      const ids = raw.map(x => uuid(object(x).id, '상품 ID')); if (new Set(ids).size !== ids.length || new Set(removed).size !== removed.length || removed.some(x => ids.includes(x))) fail(422, '상품 ID가 중복되거나 삭제 목록과 겹칩니다.', 'duplicate_item');
      if (removed.some(x => !byId.has(x))) fail(422, '현재 리스트에 없는 상품을 삭제할 수 없습니다.', 'item_ownership');
      const novel = ids.filter(x => !byId.has(x)); if (novel.length) { const { data } = await db(c, 'product_items', { select: 'id,list_id', id: `in.(${novel.join(',')})` }); if (data?.length) fail(422, '다른 리스트에 속한 상품 ID입니다.', 'item_ownership'); }
      const items = raw.map((x, i) => itemInput(x, id, i + 1, byId.get(ids[i]!)));
      await db(c, 'rpc/save_product_draft', {}, 'POST', { p_list: listInput(list, current), p_items: items, p_removed_ids: removed }); return json({ ok: true });
    }
  }
  const completionRoute = path.match(/^\/api\/items\/([^/]+)\/completion$/);
  if (completionRoute && method === 'POST') {
    admin(c); const id = uuid(completionRoute[1], '상품 ID'), input = await body(c.request);
    if (typeof input.done !== 'boolean') fail(422, '완료 여부는 true 또는 false여야 합니다.', 'invalid_completion');
    const current = await one(c, 'product_items', id);
    if (current.done === input.done) return json({ item: current });
    // An explicit manual status change does not alter or invent channel results.
    const { data } = await db(c, 'product_items', { id: `eq.${id}`, done: `eq.${current.done}` }, 'PATCH', { done: input.done, done_at: input.done ? new Date().toISOString() : null }, 'return=representation');
    if (data?.[0]) return json({ item: data[0] });
    const latest = await one(c, 'product_items', id);
    if (latest.done === input.done) return json({ item: latest });
    fail(409, '완료 상태가 변경되었습니다. 최신 상태를 확인해 주세요.', 'completion_conflict');
  }
  if (path === '/api/settings' && method === 'GET') return json(await settings(c));
  if (path === '/api/settings' && method === 'PUT') { admin(c); const input = await body(c.request); const value = validateSettings(input.value); const revision = string(input.revision ?? input.updated_at, '설정 버전', 100); if (!revision || Number.isNaN(Date.parse(revision))) fail(422, '설정 버전이 필요합니다.', 'revision_required'); const updated = new Date().toISOString(); const { data } = await db(c, 'app_settings', { key: 'eq.product_automation_v1', updated_at: `eq.${revision}` }, 'PATCH', { value, updated_at: updated }, 'return=representation'); if (!data?.[0]) fail(409, '다른 사용자가 설정을 변경했습니다. 다시 불러와 주세요.', 'revision_conflict'); return json({ value: data[0].value, updated_at: data[0].updated_at }); }
  if (path === '/api/catalog' && method === 'GET') {
    const offset = Number(url.searchParams.get('offset') || '0'), limit = Number(url.searchParams.get('limit') || '50'); if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail(422, '페이지 범위를 확인해 주세요.', 'invalid_pagination');
    const query: Record<string, string> = { select: '*', order: 'updated_at.desc,id.asc', offset: String(offset), limit: String(limit) }; const q = string(url.searchParams.get('q'), '검색어', 100).replace(/[\\%_*(),."\r\n]/g, ' ').trim(); if (q) query.or = `(brand.ilike.*${q}*,model.ilike.*${q}*,name_own.ilike.*${q}*)`;
    const { data, headers } = await db(c, 'product_items', query, 'GET', undefined, 'count=exact'); const totalValue = headers.get('content-range')?.split('/')[1]; const total = totalValue && /^\d+$/.test(totalValue) ? Number(totalValue) : null; const items = data || []; return json({ items, total, nextOffset: items.length === limit ? offset + limit : null });
  }
  if (path === '/api/uploads' && method === 'POST') {
    admin(c); if (!c.request.headers.get('content-type')?.startsWith('multipart/form-data')) fail(415, '파일 업로드 형식이 필요합니다.', 'unsupported_content_type');
    const bytes = await boundedBody(c.request, MAX_FILE + 64 * 1024); const form = await new Response(bytes, { headers: { 'content-type': c.request.headers.get('content-type')! } }).formData();
    const listId = uuid(form.get('listId'), '리스트 ID'), itemId = uuid(form.get('itemId'), '상품 ID'); await one(c, 'product_lists', listId);
    const { data: existing } = await db(c, 'product_items', { id: `eq.${itemId}`, select: 'id,list_id', limit: '1' }); if (existing?.[0] && existing[0].list_id !== listId) fail(422, '다른 리스트의 상품입니다.', 'item_ownership');
    const file = form.get('file'); if (!file || typeof file === 'string' || !('arrayBuffer' in file)) fail(422, '이미지 파일이 필요합니다.', 'file_required');
    const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }; const ext = extensions[file.type]; if (!ext || !file.size || file.size > MAX_FILE) fail(422, 'JPG·PNG·WEBP·GIF 6MB 이하 파일을 선택해 주세요.', 'invalid_file');
    const content = new Uint8Array(await file.arrayBuffer()); const ascii = (start: number, end: number) => new TextDecoder().decode(content.slice(start, end));
    const signature = ext === 'jpg' ? content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff : ext === 'png' ? content[0] === 0x89 && ascii(1, 4) === 'PNG' : ext === 'gif' ? ['GIF87a', 'GIF89a'].includes(ascii(0, 6)) : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'; if (!signature) fail(422, '이미지 파일의 실제 형식을 확인해 주세요.', 'invalid_file');
    const path = `${listId}/${itemId}/${crypto.randomUUID()}.${ext}`; const { url: base } = config(c.env, true); const res = await c.fetch(`${base}/storage/v1/object/product-thumbnails/${path}`, { method: 'POST', headers: { apikey: c.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': file.type, 'x-upsert': 'false' }, body: content, signal: AbortSignal.timeout(30000) }); if (!res.ok) fail(502, '이미지를 업로드하지 못했습니다.', 'upload_failed');
    return json({ path, url: `${base}/storage/v1/object/public/product-thumbnails/${path}`, originalName: file.name, mimeType: file.type, size: file.size }, 201);
  }
  if (path === '/api/runner/context' && method === 'GET') { admin(c); const id = uuid(url.searchParams.get('listId'), '리스트 ID'); const [list, items, s, regs] = await Promise.all([one(c, 'product_lists', id), allRows(c, 'product_items', { list_id: `eq.${id}`, select: '*', order: 'seq.asc,created_at.asc,id.asc' }), settings(c), registrations(c, id)]); return json({ list, items, settings: s.value, registrations: regs }); }
  if (path === '/api/runner/registrations' && method === 'POST') {
    admin(c); const input = await body(c.request), itemId = uuid(input.itemId, '상품 ID'); await one(c, 'product_items', itemId);
    if (!CHANNELS.includes(input.channel)) fail(422, '지원하지 않는 등록 채널입니다.', 'unsupported_channel'); if (!['pending', 'running', 'success', 'failed'].includes(input.status)) fail(422, '등록 상태를 확인해 주세요.', 'invalid_status');
    const warnings = array(input.warnings || [], '경고', 50).map(x => string(x, '경고', 2000)); const stamp = new Date().toISOString();
    const payload = { item_id: itemId, channel: input.channel, status: input.status, goods_no: string(input.goodsNo, '상품번호', 100) || null, error_message: string(input.errorMessage, '오류', 4000) || null, warnings, attempted_at: stamp, updated_at: stamp };
    // A cancellation must release the exact claim version returned to this runner.
    // Matching only status could let a delayed stop release a newer runner's claim.
    const expectedUpdatedAt = input.status === 'pending' ? string(input.expectedUpdatedAt, '실행 버전', 100) : '';
    if (input.status === 'pending' && (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt)))) fail(422, '중단할 실행의 버전이 필요합니다.', 'claim_revision_required');
    // Claim is a compare-and-set; the unique item/channel constraint arbitrates first inserts.
    const allowed = input.status === 'running' ? 'in.(pending,failed)' : input.status === 'success' ? 'eq.running' : input.status === 'failed' ? 'in.(pending,running)' : 'in.(running,failed)';
    const query = { item_id: `eq.${itemId}`, channel: `eq.${input.channel}` };
    const { data: changed } = await db(c, 'product_registrations', { ...query, status: allowed, ...(expectedUpdatedAt ? { updated_at: `eq.${expectedUpdatedAt}` } : {}) }, 'PATCH', payload, 'return=representation');
    if (changed?.[0]) return json({ registration: changed[0] });
    const { data: existing } = await db(c, 'product_registrations', { ...query, select: '*', limit: '1' });
    // Repeating a completed cancellation is a no-op, never an additional state write.
    if (input.status === 'pending' && existing?.[0]?.status === 'pending') return json({ registration: existing[0] });
    if (existing?.length || input.status === 'success' || input.status === 'pending') fail(409, '이미 실행 중이거나 완료된 상품입니다. 최신 상태를 확인해 주세요.', 'registration_conflict');
    const { data: inserted } = await db(c, 'product_registrations', {}, 'POST', payload, 'return=representation');
    return json({ registration: inserted?.[0] || payload });
  }
  if (path === '/api/runner/complete' && method === 'POST') {
    admin(c); const input = await body(c.request), id = uuid(input.itemId, '상품 ID'), item = await one(c, 'product_items', id);
    const { data } = await db(c, 'product_registrations', { item_id: `eq.${id}`, select: 'channel,status' }); const required = CHANNELS.filter(ch => item[`need_${ch}`] === '필요');
    const completed = required.length > 0 && required.every(ch => (data || []).some((r: Row) => r.channel === ch && r.status === 'success'));
    if (completed && !item.done) await db(c, 'product_items', { id: `eq.${id}`, done: 'eq.false' }, 'PATCH', { done: true, done_at: new Date().toISOString() });
    return json({ done: Boolean(item.done) || completed, godomallComplete: completed, naverImplemented: false });
  }
  fail(404, 'API 경로를 찾을 수 없습니다.', 'not_found');
}
export function createWorker(options: { fetch?: typeof fetch } = {}) {
  const fetcher = options.fetch || globalThis.fetch;
  return { async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url); if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      const origin = request.headers.get('origin'); if (origin && origin !== url.origin) fail(403, '다른 출처의 요청은 허용되지 않습니다.', 'origin_denied');
      if (url.pathname === '/api/config' && request.method === 'GET') { const c = config(env); return json({ supabaseUrl: c.url, supabasePublishableKey: c.key }); }
      const context = await auth(request, env, fetcher); return await route(context, url.pathname.replace(/\/$/, ''), request.method, url);
    } catch (error) { if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message } }, error.status); return json({ error: { code: 'internal_error', message: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' } }, 500); }
  } };
}
export default createWorker();
