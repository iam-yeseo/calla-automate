import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountError, accountIdentity, accountRoute, ensureAccountActive, type AccountsEnv } from '../server/accounts.ts';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SETUP_TOKEN = 'a-long-test-token-with-entropy-0123456789';
const env: AccountsEnv = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-public', SUPABASE_SERVICE_ROLE_KEY: 'test-service', ADMIN_EMAILS: '', CALLA_SETUP_TOKEN: SETUP_TOKEN };
const admin = { id: ADMIN_ID, email: 'admin@example.com', role: 'admin' as const };
const rawUser = (meta: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({ id: USER_ID, email: '746573742d75736572@accounts.calla.invalid', created_at: '2026-10-01T00:00:00Z', last_sign_in_at: null, app_metadata: { calla_username: 'test-user', calla_name: '사용자', ...meta }, ...extra });
const response = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });
type Call = { url: URL; method: string; body: Record<string, any> | undefined; headers: Headers };
function harness(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = { url: new URL(String(input)), method: init?.method || 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined, headers: new Headers(init?.headers) };
    calls.push(call); return handler(call);
  };
  return { calls, fetcher: fetcher as typeof fetch };
}
function request(path: string, method = 'POST', value?: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://calla.test${path}`, { method, headers: { ...(value !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, ...(value !== undefined ? { body: JSON.stringify(value) } : {}) });
}
async function run(req: Request, fetcher: typeof fetch, actor?: typeof admin, settings = env) {
  try { return await accountRoute(req, settings, fetcher, actor); }
  catch (error) { if (!(error instanceof AccountError)) throw error; return response({ error: { code: error.code, message: error.message } }, error.status); }
}
const payload = { username: 'Test-User', name: '사용자', password: 'StrongPassword123' };

test('signup creates only a pending trusted profile and never accepts privilege metadata', async () => {
  const a = harness(c => response(rawUser(c.body!.app_metadata), 201));
  const result = await run(request('/api/auth/signup', 'POST', payload), a.fetcher);
  assert.equal(result!.status, 201); assert.deepEqual(await result!.json(), { username: 'test-user', message: '가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.' });
  const call = a.calls[0]!; assert.equal(call.url.pathname, '/auth/v1/admin/users'); assert.equal(call.body!.email, '746573742d75736572@accounts.calla.invalid');
  assert.equal(call.body!.email_confirm, true); assert.equal(call.body!.app_metadata.calla_status, 'pending'); assert.ok(!Object.hasOwn(call.body!.app_metadata, 'calla_role'));
  assert.equal(call.headers.get('apikey'), env.SUPABASE_SERVICE_ROLE_KEY);
  for (const extra of [{ role: 'admin' }, { status: 'active' }, { app_metadata: { calla_role: 'admin' } }, { user_metadata: { calla_role: 'admin' } }]) {
    assert.equal((await run(request('/api/auth/signup', 'POST', { ...payload, ...extra }), a.fetcher))!.status, 422);
  }
  assert.equal(a.calls.length, 1);
});

test('username encoding is valid and collision-free for dotted IDs and normalizes case', async () => {
  const a = harness(c => response(rawUser(c.body!.app_metadata)));
  for (const id of ['abc.', 'a..b', 'a_b', 'a-b', 'AbC', 'x'.repeat(32)]) await run(request('/api/auth/signup', 'POST', { ...payload, username: id }), a.fetcher);
  const emails = a.calls.map(c => c.body!.email as string);
  assert.equal(new Set(emails).size, emails.length); assert.ok(emails.every(email => /^[0-9a-f]{6,64}@accounts\.calla\.invalid$/.test(email))); assert.deepEqual(emails.map(email => email.toLowerCase()), emails);
  assert.equal(emails[0], '6162632e@accounts.calla.invalid'); assert.equal(emails[1], '612e2e62@accounts.calla.invalid'); assert.equal(emails[5]!.split('@')[0]!.length, 64);
  assert.equal(a.calls[4]!.body!.app_metadata.calla_username, 'abc');
  for (const id of ['ab', '한글', '@name', 'x'.repeat(33), 'calla-admin']) assert.equal((await run(request('/api/auth/signup', 'POST', { ...payload, username: id }), a.fetcher))!.status, 422);
  assert.equal(a.calls.length, 6);
});

test('setup requires a long configured secret and creates a fixed administrator without promoting conflicts', async () => {
  const a = harness(c => response(rawUser(c.body!.app_metadata), 201));
  const input = { password: payload.password, setupToken: SETUP_TOKEN, name: '최초 관리자' };
  assert.equal((await run(request('/api/auth/setup', 'POST', { ...input, setupToken: 'wrong' }), a.fetcher))!.status, 403);
  assert.equal((await run(request('/api/auth/setup', 'POST', input), a.fetcher, undefined, { ...env, CALLA_SETUP_TOKEN: 'short' }))!.status, 503);
  assert.equal(a.calls.length, 0);
  const good = await run(request('/api/auth/setup', 'POST', input), a.fetcher);
  assert.equal(good!.status, 201); assert.equal((await good!.json() as any).username, 'calla-admin');
  assert.equal(a.calls[0]!.body!.email, '63616c6c612d61646d696e@accounts.calla.invalid');
  assert.deepEqual(a.calls[0]!.body!.app_metadata, { calla_username: 'calla-admin', calla_name: '최초 관리자', calla_status: 'active', calla_role: 'admin' });
  const duplicate = harness(() => response({ code: 'email_exists', msg: 'private test-service diagnostic' }, 422));
  const conflict = await run(request('/api/auth/setup', 'POST', input), duplicate.fetcher);
  assert.equal(conflict!.status, 409); assert.equal(duplicate.calls.length, 1); assert.equal(duplicate.calls[0]!.method, 'POST');
  assert.ok(!(await conflict!.text()).includes('test-service'));
});

test('login uses the public key and only exposes sessions for approved fresh Auth users', async () => {
  const a = harness(() => response({ access_token: 'user-access', refresh_token: 'user-refresh', user: rawUser({ calla_role: 'viewer', calla_status: 'active' }), private: env.SUPABASE_SERVICE_ROLE_KEY }));
  const result = await run(request('/api/auth/login', 'POST', { identifier: 'TEST-USER', password: payload.password }), a.fetcher);
  assert.deepEqual(await result!.json(), { access_token: 'user-access', refresh_token: 'user-refresh' });
  assert.equal(a.calls[0]!.url.searchParams.get('grant_type'), 'password'); assert.equal(a.calls[0]!.body!.email, '746573742d75736572@accounts.calla.invalid');
  assert.equal(a.calls[0]!.headers.get('apikey'), env.SUPABASE_PUBLISHABLE_KEY); assert.equal(a.calls[0]!.headers.get('authorization'), null);
  await run(request('/api/auth/login', 'POST', { username: 'Legacy@Example.com', password: 'old' }), a.fetcher);
  assert.equal(a.calls[1]!.body!.email, 'legacy@example.com');
  for (const profile of [rawUser({ calla_role: 'admin', calla_status: 'pending' }), rawUser({ calla_role: 'admin', calla_status: 'disabled' }), rawUser({ calla_role: 'viewer', calla_status: 'unknown' }), rawUser({}, { user_metadata: { calla_role: 'admin' } })]) {
    const b = harness(() => response({ access_token: 'never-expose-access', refresh_token: 'never-expose-refresh', user: profile }));
    const denied = await run(request('/api/auth/login', 'POST', { username: 'test-user', password: payload.password }), b.fetcher);
    assert.equal(denied!.status, 403); const body = await denied!.text(); assert.ok(!body.includes('never-expose'));
  }
});

test('identity preserves legacy approval, respects fresh suspension and sanitizes internal identities', () => {
  const legacy = rawUser({ calla_role: 'admin' }, { email: 'legacy@example.com', app_metadata: { calla_role: 'admin' } });
  assert.equal(ensureAccountActive(legacy).role, 'admin'); assert.equal(accountIdentity(legacy).username, 'legacy@example.com');
  const approvedEnv = { ADMIN_EMAILS: ' LEGACY@example.com ' };
  const external = { ...legacy, email_confirmed_at: '2026-10-01', app_metadata: {} };
  assert.equal(ensureAccountActive(external, approvedEnv).role, 'admin');
  assert.throws(() => ensureAccountActive({ ...external, email_confirmed_at: null }, approvedEnv), AccountError);
  for (const calla_status of ['pending', 'disabled', 'unknown', null]) assert.throws(() => ensureAccountActive({ ...external, app_metadata: { calla_status } }, approvedEnv), AccountError);
  assert.throws(() => ensureAccountActive(rawUser({ calla_role: 'admin' }, { banned_until: '2999-01-01T00:00:00Z' })), AccountError);
  assert.throws(() => ensureAccountActive(rawUser({ calla_role: 'admin' }, { deleted_at: '2026-10-01' })), AccountError);
  const internal = accountIdentity(rawUser({ calla_role: 'viewer', provider_secret: 'private' }, { password: 'private', user_metadata: { calla_role: 'admin' } }));
  assert.equal(internal.email, ''); assert.equal(internal.username, 'test-user'); assert.equal(internal.role, 'viewer');
  assert.deepEqual(Object.keys(internal), ['id', 'username', 'name', 'email', 'role', 'status', 'createdAt', 'lastSignInAt']);
  assert.ok(!JSON.stringify(internal).includes('private')); assert.ok(!JSON.stringify(internal).includes('@accounts.calla.invalid'));
});

test('user listing is admin-only, bounded, paginated and contains only safe projections', async () => {
  const a = harness(() => response({ users: [rawUser({ calla_role: 'viewer' }), rawUser({ calla_role: 'viewer' }, { deleted_at: '2026-10-01' })] }, 200, { link: '<https://example.supabase.co/auth/v1/admin/users?page=2>; rel="next"' }));
  assert.equal((await run(request('/api/admin/users', 'GET'), a.fetcher))!.status, 401);
  assert.equal((await run(request('/api/admin/users', 'GET'), a.fetcher, { ...admin, role: 'viewer' } as any))!.status, 403); assert.equal(a.calls.length, 0);
  const result = await run(request('/api/admin/users?page=1', 'GET'), a.fetcher, admin);
  const body: any = await result!.json(); assert.equal(body.page, 1); assert.equal(body.hasMore, true); assert.equal(body.users[0].email, ''); assert.equal(body.users.length, 1);
  assert.equal(a.calls[0]!.url.searchParams.get('per_page'), '100');
  for (const page of ['0', '-1', '1.2', 'abc']) assert.equal((await run(request(`/api/admin/users?page=${page}`, 'GET'), a.fetcher, admin))!.status, 422);
  const last = harness(() => response({ users: Array.from({ length: 100 }, () => rawUser({ calla_role: 'viewer' })) }, 200, { 'x-total-count': '100' }));
  assert.equal((await (await run(request('/api/admin/users', 'GET'), last.fetcher, admin))!.json() as any).hasMore, false);
});

test('admin creation can approve or suspend an account but cannot claim the bootstrap ID', async () => {
  const a = harness(c => response(rawUser(c.body!.app_metadata)));
  const created = await run(request('/api/admin/users', 'POST', { ...payload, role: 'admin', status: 'disabled' }), a.fetcher, admin);
  assert.equal(created!.status, 201); assert.equal(a.calls[0]!.body!.ban_duration, '876000h'); assert.equal(a.calls[0]!.body!.app_metadata.calla_role, 'admin');
  assert.equal((await run(request('/api/admin/users', 'POST', { ...payload, username: 'calla-admin' }), a.fetcher, admin))!.status, 422);
  assert.equal((await run(request('/api/admin/users', 'POST', { ...payload, role: null, status: 'active' }), a.fetcher, admin))!.status, 422);
  assert.equal(a.calls.length, 1);
});

test('account updates preserve unrelated app metadata and coordinate approval, ban and unban', async () => {
  const original = rawUser({ calla_status: 'pending', provider: 'email', providers: ['email'], other_app: { keep: true } });
  const a = harness(c => c.method === 'GET' ? response(original) : response({ ...original, app_metadata: { ...original.app_metadata, ...c.body!.app_metadata } }));
  const approved = await run(request(`/api/admin/users/${USER_ID}`, 'PUT', { name: '새 이름', role: 'viewer', status: 'active', password: 'ChangedPassword123' }), a.fetcher, admin);
  assert.equal(approved!.status, 200); const update = a.calls[1]!.body!;
  assert.equal(update.password, 'ChangedPassword123'); assert.equal(update.ban_duration, 'none');
  assert.deepEqual(update.app_metadata, { calla_name: '새 이름', calla_role: 'viewer', calla_status: 'active' });
  const safe: any = await approved!.json(); assert.equal(safe.user.username, 'test-user');
  await run(request(`/api/admin/users/${USER_ID}`, 'PUT', { status: 'disabled' }), a.fetcher, admin);
  assert.equal(a.calls[3]!.body!.ban_duration, '876000h');
  const noRole = await run(request(`/api/admin/users/${USER_ID}`, 'PUT', { status: 'active' }), a.fetcher, admin);
  assert.equal(noRole!.status, 422); assert.equal(a.calls.length, 5);
});

test('a name-only update cannot overwrite a concurrent suspension or unrelated metadata', async () => {
  const earlier = rawUser({ calla_role: 'admin', calla_status: 'active', other_app: { keep: true } });
  const fresh = { ...earlier, app_metadata: { ...earlier.app_metadata, calla_role: 'viewer', calla_status: 'disabled' } };
  const a = harness(c => {
    if (c.method === 'GET') return response(earlier);
    assert.deepEqual(c.body, { app_metadata: { calla_name: '변경한 이름' } });
    const app_metadata = { ...fresh.app_metadata, ...c.body!.app_metadata };
    assert.deepEqual((app_metadata as Record<string, unknown>).other_app, { keep: true });
    return response({ ...fresh, app_metadata });
  });
  const result = await run(request(`/api/admin/users/${USER_ID}`, 'PUT', { name: '변경한 이름' }), a.fetcher, admin);
  const body: any = await result!.json(); assert.equal(body.user.role, 'viewer'); assert.equal(body.user.status, 'disabled'); assert.equal(body.user.name, '변경한 이름');
});

test('soft-deleted Auth tombstones cannot be updated', async () => {
  const a = harness(() => response(rawUser({ calla_role: 'viewer' }, { deleted_at: '2026-10-01' })));
  const result = await run(request(`/api/admin/users/${USER_ID}`, 'PUT', { name: '새 이름' }), a.fetcher, admin);
  assert.equal(result!.status, 404); assert.deepEqual(a.calls.map(c => c.method), ['GET']);
});

test('self deletion, demotion and suspension are rejected before mutations', async () => {
  const a = harness(() => response(rawUser()));
  for (const [method, input] of [['DELETE', undefined], ['PUT', { role: 'viewer' }], ['PUT', { role: null }], ['PUT', { status: 'pending' }], ['PUT', { status: 'disabled' }]] as const) {
    assert.equal((await run(request(`/api/admin/users/${ADMIN_ID}`, method, input), a.fetcher, admin))!.status, 409);
  }
  assert.equal(a.calls.length, 0);
});

test('bootstrap admin is protected from every admin but its name and password remain editable', async () => {
  const bootstrap = rawUser({ calla_username: 'calla-admin', calla_name: '관리자', calla_role: 'admin', calla_status: 'active' }, { email: '63616c6c612d61646d696e@accounts.calla.invalid' });
  const a = harness(c => c.method === 'GET' ? response(bootstrap) : response({ ...bootstrap, app_metadata: { ...bootstrap.app_metadata, ...c.body!.app_metadata } }));
  for (const [method, input] of [['DELETE', undefined], ['PUT', { role: 'viewer' }], ['PUT', { status: 'pending' }], ['PUT', { status: 'disabled' }]] as const) assert.equal((await run(request(`/api/admin/users/${USER_ID}`, method, input), a.fetcher, admin))!.status, 409);
  assert.ok(a.calls.every(c => c.method === 'GET'));
  const edited = await run(request(`/api/admin/users/${USER_ID}`, 'PUT', { name: '새 관리자', password: 'ChangedPassword123' }), a.fetcher, admin);
  assert.equal(edited!.status, 200); assert.equal(a.calls.at(-1)!.body!.password, 'ChangedPassword123'); assert.deepEqual(a.calls.at(-1)!.body!.app_metadata, { calla_name: '새 관리자' }); assert.equal((await edited!.json() as any).user.role, 'admin');
});

test('deletion uses Auth soft delete and never touches product data', async () => {
  const a = harness(c => c.method === 'GET' ? response(rawUser({ calla_role: 'viewer' })) : response({}));
  const result = await run(request(`/api/admin/users/${USER_ID}`, 'DELETE'), a.fetcher, admin);
  assert.deepEqual(await result!.json(), { ok: true }); assert.deepEqual(a.calls.map(c => c.method), ['GET', 'DELETE']);
  assert.deepEqual(a.calls[1]!.body, { should_soft_delete: true }); assert.ok(a.calls.every(c => c.url.pathname.startsWith('/auth/v1/admin/users')));
});

test('public bodies are bounded and cross-origin, malformed and unsupported requests do not reach Auth', async () => {
  const a = harness(() => { throw Error('must not fetch'); });
  assert.equal((await run(request('/api/auth/signup', 'POST', { ...payload, name: 'x'.repeat(17 * 1024) }), a.fetcher))!.status, 413);
  assert.equal((await run(request('/api/auth/signup', 'POST', payload, { 'content-length': String(17 * 1024) }), a.fetcher))!.status, 413);
  assert.equal((await run(request('/api/auth/signup', 'POST', payload, { origin: 'https://evil.test' }), a.fetcher))!.status, 403);
  assert.equal((await run(request('/api/auth/signup', 'GET'), a.fetcher))!.status, 405);
  assert.equal((await run(request('/api/auth/signup', 'POST', payload, { 'content-type': 'text/plain' }), a.fetcher))!.status, 415);
  assert.equal((await run(new Request('https://calla.test/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }), a.fetcher))!.status, 400);
  assert.equal((await run(request('/api/auth/signup', 'POST', []), a.fetcher))!.status, 422); assert.equal(a.calls.length, 0);
});

test('upstream failures are sanitized and unrelated API routes return null', async () => {
  const a = harness(() => response({ code: 'unexpected', msg: 'private test-service password row' }, 500));
  const result = await run(request('/api/auth/signup', 'POST', payload), a.fetcher);
  assert.equal(result!.status, 502); assert.ok(!(await result!.text()).includes('private'));
  const invalid = harness(() => response({ code: 'invalid_credentials', msg: 'private' }, 400));
  assert.equal((await run(request('/api/auth/login', 'POST', { username: 'test-user', password: 'wrong' }), invalid.fetcher))!.status, 401);
  assert.equal(await accountRoute(request('/api/lists', 'GET'), env, a.fetcher), null);
});
