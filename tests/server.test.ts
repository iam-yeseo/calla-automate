import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker, validateSettings } from '../server/index.ts';
const LIST = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-public', SUPABASE_SERVICE_ROLE_KEY: 'test-secret', ADMIN_EMAILS: '', ASSETS: { fetch: async () => new Response('asset') } } as unknown as Env;
const response = (data: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
type Call = { url: URL; method: string; body: any; headers: Headers };
function harness(role: string | undefined = 'admin', handler: (call: Call) => Response | Promise<Response> = () => response([]), extra: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => { const call = { url: new URL(String(input)), method: init?.method || 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body, headers: new Headers(init?.headers) }; calls.push(call); if (call.url.pathname === '/auth/v1/user') return response({ id: USER, email: 'admin@example.com', app_metadata: { calla_role: role }, ...extra }); return handler(call); };
  return { worker: createWorker({ fetch: fetcher as typeof fetch }), calls };
}
function request(path: string, method = 'GET', value?: unknown, headers: Record<string, string> = {}) { return new Request(`https://calla.test${path}`, { method, headers: { authorization: 'Bearer user-token', ...(value !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, ...(value !== undefined ? { body: JSON.stringify(value) } : {}) }); }
const list = { id: LIST, title: '기존 리스트', author: '관리자', work_date: '2026-09-30', note: '메모' };
const item = { id: ITEM, list_id: LIST, seq: 1, name_own: '<b>원문 상품명</b>', brand: 'AVMATRIX', content: 'legacy content', image_usage: 'legacy image usage', need_retail: '필요', need_wholesale: '불필요', need_naver: '필요', done: true, done_at: '2026-09-20T00:00:00Z', price_retail: 12000, automation: { categoryCodes: { retail: '003001', wholesale: '' }, detailImages: [], detailHtml: '<div>기존 원문 HTML</div>', origin: 'China', extensionFromLaterVersion: { keep: true } } };

test('default fetch retains the Workers receiver for authenticated dashboard database calls', async () => {
  const originalFetch = globalThis.fetch;
  const calls: URL[] = [];
  // workerd accepts a plain native fetch call, but rejects native fetch when
  // called as a method on an arbitrary Context object.
  globalThis.fetch = async function (this: unknown, input: RequestInfo | URL) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation: function called with incorrect this reference');
    const url = new URL(String(input)); calls.push(url);
    if (url.pathname === '/auth/v1/user') return response({ id: USER, email: 'admin@example.com', app_metadata: { calla_role: 'admin' } });
    if (url.pathname === '/rest/v1/app_settings') return response([{ value: { schemaVersion: 1, brands: [], folders: [], categories: { retail: [], wholesale: [] } }, updated_at: '2026-10-01T00:00:00Z' }]);
    return response([]);
  } as typeof fetch;
  try {
    const worker = createWorker();
    for (const path of ['/api/me', '/api/lists', '/api/settings', '/api/catalog']) {
      const result = await worker.fetch(request(path), env);
      assert.equal(result.status, 200, `${path}: ${await result.text()}`);
    }
    assert.ok(calls.some(url => url.pathname === '/rest/v1/app_settings'));
    assert.ok(calls.some(url => url.pathname === '/rest/v1/product_lists'));
    assert.ok(calls.some(url => url.pathname === '/rest/v1/product_items'));
  } finally { globalThis.fetch = originalFetch; }
});

test('config publishes only URL and publishable key; assets work without backend credentials', async () => {
  const { worker, calls } = harness();
  const config = await worker.fetch(request('/api/config'), env); const data = await config.json();
  assert.deepEqual(data, { supabaseUrl: env.SUPABASE_URL, supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY }); assert.equal(calls.length, 0); assert.ok(!JSON.stringify(data).includes(env.SUPABASE_SERVICE_ROLE_KEY));
  assert.equal(await (await worker.fetch(request('/anything'), { ...env, SUPABASE_URL: '' })).text(), 'asset');
  assert.equal((await worker.fetch(request('/api/config'), { ...env, SUPABASE_URL: '' })).status, 503);
});
test('missing token, user_metadata roles, unverified email override and cross-origin requests are denied', async () => {
  const a = harness(); const unauth = new Request('https://calla.test/api/lists'); assert.equal((await a.worker.fetch(unauth, env)).status, 401); assert.equal(a.calls.length, 0);
  const b = harness(undefined, undefined, { user_metadata: { calla_role: 'admin' }, app_metadata: {} }); assert.equal((await b.worker.fetch(request('/api/me'), env)).status, 403);
  assert.equal((await b.worker.fetch(request('/api/me'), { ...env, ADMIN_EMAILS: 'admin@example.com' })).status, 403);
  const c = harness(undefined, undefined, { app_metadata: {}, email_confirmed_at: '2026-09-30T00:00:00Z' }); assert.equal((await c.worker.fetch(request('/api/me'), { ...env, ADMIN_EMAILS: 'admin@example.com' })).status, 200);
  assert.equal((await a.worker.fetch(request('/api/lists', 'GET', undefined, { origin: 'https://evil.test' }), env)).status, 403);
});
test('viewer can read but cannot mutate any write route', async () => {
  const { worker, calls } = harness('viewer'); const me = await (await worker.fetch(request('/api/me'), env)).json() as any; assert.equal(me.role, 'viewer');
  for (const [method, path] of [['POST', '/api/lists'], ['DELETE', `/api/lists/${LIST}`], ['PUT', `/api/lists/${LIST}/draft`], ['POST', `/api/items/${ITEM}/completion`], ['PUT', '/api/settings'], ['POST', '/api/uploads'], ['POST', '/api/runner/registrations'], ['POST', '/api/runner/complete'], ['GET', `/api/runner/context?listId=${LIST}`]]) assert.equal((await worker.fetch(request(path!, method!, method === 'GET' || method === 'DELETE' ? undefined : {}), env)).status, 403);
  assert.ok(calls.every(c => c.url.pathname === '/auth/v1/user'));
});
test('draft save is one RPC, preserves HTML/legacy/unknown automation fields and excludes done state', async () => {
  let rpc: any;
  const { worker } = harness('admin', c => { if (c.url.pathname.endsWith('/product_lists')) return response([list]); if (c.url.pathname.endsWith('/product_items')) return response([item]); if (c.url.pathname.endsWith('/rpc/save_product_draft')) { rpc = c.body; return response(null); } throw Error('Unexpected request'); });
  const result = await worker.fetch(request(`/api/lists/${LIST}/draft`, 'PUT', { list, items: [{ id: ITEM, name_own: '<strong>새 상품명</strong>', done: false, done_at: null, automation: { detailImages: [{ id: 'image-1', folder: 'audio', filename: 'test.jpg', linkEnabled: true, linkUrl: 'https://example.com/path' }] } }], removedIds: [] }), env);
  assert.equal(result.status, 200); assert.equal(rpc.p_items[0].name_own, '<strong>새 상품명</strong>'); assert.equal(rpc.p_items[0].content, item.content); assert.equal(rpc.p_items[0].image_usage, item.image_usage); assert.equal(rpc.p_items[0].automation.detailHtml, item.automation.detailHtml); assert.deepEqual(rpc.p_items[0].automation.extensionFromLaterVersion, { keep: true }); assert.equal(rpc.p_items[0].automation.detailImages[0].linkEnabled, true); assert.ok(!('done' in rpc.p_items[0])); assert.ok(!('done_at' in rpc.p_items[0])); assert.equal(rpc.p_list.note, '메모');
});
test('draft rejects duplicate and foreign IDs before any mutation', async () => {
  const { worker, calls } = harness('admin', c => c.url.pathname.endsWith('/product_lists') ? response([list]) : c.url.searchParams.has('id') ? response([{ id: OTHER, list_id: OTHER }]) : response([item]));
  for (const items of [[{ id: ITEM }, { id: ITEM }], [{ id: OTHER }]]) assert.equal((await worker.fetch(request(`/api/lists/${LIST}/draft`, 'PUT', { list, items, removedIds: [] }), env)).status, 422);
  assert.ok(calls.every(c => c.method === 'GET'));
});
test('invalid dates and oversized requests return validation errors without database writes', async () => {
  const { worker, calls } = harness();
  assert.equal((await worker.fetch(request('/api/lists', 'POST', { title: '목록', work_date: '2026-02-30' }), env)).status, 422);
  assert.equal((await worker.fetch(request('/api/lists', 'POST', { title: '목록', work_date: '2026-99-99' }), env)).status, 422);
  assert.equal((await worker.fetch(request('/api/lists', 'POST', { title: '목록' }, { 'content-length': String(5 * 1024 * 1024) }), env)).status, 413);
  assert.ok(calls.every(c => c.url.pathname === '/auth/v1/user'));
});
test('settings stale revision returns 409 and uses timestamp compare-and-set', async () => {
  let seen: Call | undefined; const { worker } = harness('admin', c => { seen = c; return response([]); });
  const result = await worker.fetch(request('/api/settings', 'PUT', { value: { categories: { retail: [], wholesale: [] }, folders: [], brands: [] }, revision: '2026-09-30T00:00:00Z' }), env);
  assert.equal(result.status, 409); assert.equal(seen?.url.searchParams.get('updated_at'), 'eq.2026-09-30T00:00:00Z'); assert.equal(seen?.method, 'PATCH');
  assert.throws(() => validateSettings({ folders: ['audio'], categories: { retail: [{ code: '001001', name: 'orphan', parentCode: '001' }], wholesale: [] }, brands: [] }));
});
test('running claim cannot overwrite a running/success row and CAS is enforced in the database query', async () => {
  let condition: string | null = null; const { worker, calls } = harness('admin', c => { if (c.url.pathname.endsWith('/product_items')) return response([item]); if (c.method === 'PATCH') { condition = c.url.searchParams.get('status'); return response([]); } return response([{ status: 'running' }]); });
  const result = await worker.fetch(request('/api/runner/registrations', 'POST', { itemId: ITEM, channel: 'retail', status: 'running' }), env); assert.equal(result.status, 409); assert.equal(condition, 'in.(pending,failed)'); assert.ok(!calls.some(c => c.method === 'POST'));
});
test('first claim uses unique insert; duplicate racing insert is 409', async () => {
  const { worker } = harness('admin', c => { if (c.url.pathname.endsWith('/product_items')) return response([item]); if (c.method === 'POST') return response({ code: '23505' }, 409); return response([]); });
  assert.equal((await worker.fetch(request('/api/runner/registrations', 'POST', { itemId: ITEM, channel: 'retail', status: 'running' }), env)).status, 409);
});
test('completion requires every requested Godomall channel, preserves existing done and leaves Naver unimplemented', async () => {
  let patched = false; const { worker } = harness('admin', c => { if (c.method === 'PATCH') { patched = true; return response(null); } return c.url.pathname.endsWith('/product_items') ? response([{ ...item, done: false }]) : response([{ channel: 'retail', status: 'success' }]); });
  const result = await (await worker.fetch(request('/api/runner/complete', 'POST', { itemId: ITEM }), env)).json() as any; assert.equal(result.done, true); assert.equal(result.naverImplemented, false); assert.equal(patched, true);
});
test('service secret is used only for database transport and failures do not echo upstream data', async () => {
  const { worker } = harness('admin', c => { assert.equal(c.headers.get('apikey'), 'test-secret'); return response({ message: 'private diagnostic test-secret', details: 'sensitive row' }, 500); });
  const result = await worker.fetch(request(`/api/lists/${LIST}`), env); assert.equal(result.status, 502); const text = await result.text(); assert.ok(!text.includes('test-secret')); assert.ok(!text.includes('sensitive row'));
});

test('configuration never publishes a secret accidentally placed in the public-key binding', async () => {
  const { worker } = harness();
  for (const key of ['sb_secret_should_not_be_public', env.SUPABASE_SERVICE_ROLE_KEY, `header.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`]) {
    const result = await worker.fetch(request('/api/config'), { ...env, SUPABASE_PUBLISHABLE_KEY: key });
    assert.equal(result.status, 503); assert.ok(!(await result.text()).includes(key));
  }
});

test('manual completion stamps transitions, preserves repeated completion and does not touch registrations', async () => {
  let current = { ...item, done: false, done_at: null as string | null };
  const { worker, calls } = harness('admin', c => {
    assert.ok(c.url.pathname.endsWith('/product_items'));
    if (c.method === 'PATCH') {
      assert.equal(c.url.searchParams.get('done'), `eq.${current.done}`);
      assert.deepEqual(Object.keys(c.body).sort(), ['done', 'done_at']);
      current = { ...current, ...c.body };
    }
    return response([current]);
  });
  const start = Date.now();
  const completed = await (await worker.fetch(request(`/api/items/${ITEM}/completion`, 'POST', { done: true }), env)).json() as any;
  assert.equal(completed.item.done, true); assert.ok(Date.parse(completed.item.done_at) >= start);
  const stamp = completed.item.done_at;
  const repeated = await (await worker.fetch(request(`/api/items/${ITEM}/completion`, 'POST', { done: true }), env)).json() as any;
  assert.equal(repeated.item.done_at, stamp); assert.equal(calls.filter(c => c.method === 'PATCH').length, 1);
  const undone = await (await worker.fetch(request(`/api/items/${ITEM}/completion`, 'POST', { done: false }), env)).json() as any;
  assert.equal(undone.item.done, false); assert.equal(undone.item.done_at, null);
  assert.equal(calls.filter(c => c.method === 'PATCH').length, 2);
});
test('manual completion rejects nonboolean and missing products; GET never changes completion', async () => {
  const { worker, calls } = harness('admin', c => c.url.pathname.endsWith('/product_lists') ? response([list]) : response([item]));
  for (const done of ['false', 0, null, undefined]) assert.equal((await worker.fetch(request(`/api/items/${ITEM}/completion`, 'POST', { done }), env)).status, 422);
  assert.ok(calls.every(c => c.url.pathname === '/auth/v1/user'));
  const result = await (await worker.fetch(request(`/api/lists/${LIST}/items`), env)).json() as any;
  assert.equal(result.items[0].done, true); assert.equal(result.items[0].done_at, item.done_at);
  assert.equal((await worker.fetch(request(`/api/items/${ITEM}/completion`), env)).status, 404);
  assert.ok(calls.every(c => c.method === 'GET'));
  const missing = harness('admin', () => response([]));
  assert.equal((await missing.worker.fetch(request(`/api/items/${ITEM}/completion`, 'POST', { done: true }), env)).status, 404);
});
test('list summaries keep manual completion separate from channel results and return zeros for empty lists', async () => {
  const rows = [{ ...item, done: true }, { ...item, id: USER, done: false, need_wholesale: '필요' }];
  const results = [{ item_id: ITEM, channel: 'wholesale', status: 'success' }, { item_id: USER, channel: 'retail', status: 'running' }, { item_id: USER, channel: 'wholesale', status: 'failed' }];
  const { worker, calls } = harness('viewer', c => c.url.pathname.endsWith('/product_lists') ? response([list, { ...list, id: OTHER }]) : c.url.pathname.endsWith('/product_items') ? response(rows) : response(results));
  const data = await (await worker.fetch(request('/api/lists'), env)).json() as any;
  const summary = (v: any) => Object.fromEntries(['total', 'doneCount', 'retailSuccess', 'wholesaleSuccess', 'retailTotal', 'wholesaleTotal', 'runningCount', 'failedCount'].map(k => [k, v[k]]));
  assert.deepEqual(summary(data.lists[0]), { total: 2, doneCount: 1, retailSuccess: 0, wholesaleSuccess: 0, retailTotal: 2, wholesaleTotal: 1, runningCount: 1, failedCount: 1 });
  assert.deepEqual(summary(data.lists[1]), { total: 0, doneCount: 0, retailSuccess: 0, wholesaleSuccess: 0, retailTotal: 0, wholesaleTotal: 0, runningCount: 0, failedCount: 0 });
  assert.ok(calls.every(c => c.method === 'GET'));
});

test('runner cancellation releases only the expected running claim and stamps the transition', async () => {
  const revision = '2026-09-30T12:00:00.000123Z';
  let patch: Call | undefined;
  const { worker } = harness('admin', c => {
    if (c.url.pathname.endsWith('/product_items')) return response([item]);
    patch = c;
    return response([{ ...c.body, updated_at: c.body.updated_at }]);
  });
  const result = await worker.fetch(request('/api/runner/registrations', 'POST', { itemId: ITEM, channel: 'retail', status: 'pending', expectedUpdatedAt: revision }), env);
  assert.equal(result.status, 200);
  assert.equal(patch?.method, 'PATCH');
  assert.equal(patch?.url.searchParams.get('status'), 'in.(running,failed)');
  assert.equal(patch?.url.searchParams.get('updated_at'), `eq.${revision}`);
  assert.equal(patch?.body.status, 'pending');
  assert.ok(!Number.isNaN(Date.parse(patch?.body.updated_at)));
});
test('pending release needs a claim version, never releases a newer claim, and never inserts a row', async () => {
  const { worker, calls } = harness('admin', c => {
    if (c.url.pathname.endsWith('/product_items')) return response([item]);
    if (c.method === 'PATCH') return response([]);
    return response([{ item_id: ITEM, channel: 'retail', status: 'running', updated_at: '2026-09-30T12:01:00.000Z' }]);
  });
  for (const expectedUpdatedAt of [undefined, '', 'bad-time']) {
    assert.equal((await worker.fetch(request('/api/runner/registrations', 'POST', { itemId: ITEM, channel: 'retail', status: 'pending', expectedUpdatedAt }), env)).status, 422);
  }
  assert.ok(!calls.some(c => c.method === 'PATCH'));
  const stale = await worker.fetch(request('/api/runner/registrations', 'POST', { itemId: ITEM, channel: 'retail', status: 'pending', expectedUpdatedAt: '2026-09-30T12:00:00.000Z' }), env);
  assert.equal(stale.status, 409);
  assert.ok(!calls.some(c => c.method === 'POST'));
  const absent = harness('admin', c => c.url.pathname.endsWith('/product_items') ? response([item]) : response([]));
  assert.equal((await absent.worker.fetch(request('/api/runner/registrations', 'POST', { itemId: ITEM, channel: 'retail', status: 'pending', expectedUpdatedAt: '2026-09-30T12:00:00.000Z' }), env)).status, 409);
  assert.ok(!absent.calls.some(c => c.method === 'POST'));
});
test('repeated cancellation is idempotent but success can never be reset to pending', async () => {
  for (const [status, expectedStatus] of [['pending', 200], ['success', 409]] as const) {
    const { worker, calls } = harness('admin', c => c.url.pathname.endsWith('/product_items') ? response([item]) : c.method === 'PATCH' ? response([]) : response([{ item_id: ITEM, channel: 'retail', status, updated_at: '2026-09-30T12:00:01.000Z' }]));
    const result = await worker.fetch(request('/api/runner/registrations', 'POST', { itemId: ITEM, channel: 'retail', status: 'pending', expectedUpdatedAt: '2026-09-30T12:00:00.000Z' }), env);
    assert.equal(result.status, expectedStatus);
    assert.equal(calls.filter(c => c.method === 'PATCH').length, 1);
    assert.ok(!calls.some(c => c.method === 'POST'));
  }
});
