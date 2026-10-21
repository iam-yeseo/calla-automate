import { timingSafeEqual } from 'node:crypto';

type Role = 'admin' | 'viewer';
type Status = 'pending' | 'active' | 'disabled';
type RecordValue = Record<string, unknown>;
export type AccountsEnv = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ADMIN_EMAILS?: string;
  CALLA_SETUP_TOKEN?: string;
  CALLA_SIGNUP_CODE?: string;
};
export type AccountIdentity = {
  id: string;
  username: string;
  name: string;
  email: string;
  role: Role | null;
  status: Status;
  createdAt: string | null;
  lastSignInAt: string | null;
};
export class AccountError extends Error {
  constructor(public status: number, message: string, public code = 'account_request_failed') { super(message); }
}
const INTERNAL_DOMAIN = 'accounts.calla.invalid';
const SETUP_USERNAME = 'calla-admin';
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY = 16 * 1024;
const PAGE_SIZE = 100;
function fail(status: number, message: string, code: string): never { throw new AccountError(status, message, code); }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const textValue = (value: unknown): string => typeof value === 'string' ? value : '';
// Lowercase hex survives Auth's email normalization and encodes dotted IDs
// without collisions. A 32-character ASCII ID fits the 64-byte email local part.
const emailForUsername = (value: string) => `${[...value].map(char => char.charCodeAt(0).toString(16).padStart(2, '0')).join('')}@${INTERNAL_DOMAIN}`;
function syntheticUsername(email: string): string {
  const local = email.slice(0, -(INTERNAL_DOMAIN.length + 1));
  if (!/^(?:[0-9a-f]{2}){3,32}$/.test(local)) return '';
  const decoded = local.match(/.{2}/g)!.map(pair => String.fromCharCode(parseInt(pair, 16))).join('');
  return USERNAME.test(decoded) && emailForUsername(decoded) === email ? decoded : '';
}
function bootstrapAccount(raw: RecordValue): boolean {
  return record(raw.app_metadata).calla_username === SETUP_USERNAME || textValue(raw.email).toLowerCase() === emailForUsername(SETUP_USERNAME);
}

export function accountIdentity(raw: RecordValue, env?: Pick<AccountsEnv, 'ADMIN_EMAILS'>): AccountIdentity {
  const meta = record(raw.app_metadata);
  const email = textValue(raw.email);
  const synthetic = email.toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`);
  const approved = (env?.ADMIN_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const override = Boolean(raw.email_confirmed_at) && approved.includes(email.toLowerCase());
  const role = override ? 'admin' : meta.calla_role === 'admin' || meta.calla_role === 'viewer' ? meta.calla_role : null;
  const banned = typeof raw.banned_until === 'string' && Date.parse(raw.banned_until) > Date.now();
  // Existing approved accounts predate calla_status and retain their current access.
  const status: Status = raw.deleted_at || banned || meta.calla_status === 'disabled' ? 'disabled' : meta.calla_status === 'pending' ? 'pending' : meta.calla_status === 'active' || (meta.calla_status === undefined && role) ? 'active' : 'pending';
  const username = textValue(meta.calla_username) || (synthetic ? syntheticUsername(email.toLowerCase()) : email);
  return { id: textValue(raw.id), username, name: textValue(meta.calla_name), email: synthetic ? '' : email, role, status, createdAt: textValue(raw.created_at) || null, lastSignInAt: textValue(raw.last_sign_in_at) || null };
}
export function ensureAccountActive(raw: RecordValue, env?: Pick<AccountsEnv, 'ADMIN_EMAILS'>): AccountIdentity {
  const identity = accountIdentity(raw, env);
  if (identity.status === 'disabled') fail(403, '사용이 중지된 계정입니다. 관리자에게 문의해 주세요.', 'account_disabled');
  if (identity.status === 'pending') fail(403, '관리자 승인 대기 중입니다. 승인 후 로그인해 주세요.', 'approval_pending');
  if (!identity.role) fail(403, '이 작업 공간에 등록된 사용자만 접근할 수 있습니다.', 'membership_required');
  return identity;
}
function username(value: unknown, allowSetup = false): string {
  if (typeof value !== 'string') fail(422, '아이디를 입력해 주세요.', 'invalid_username');
  const normalized = value.trim().toLowerCase();
  if (!USERNAME.test(normalized)) fail(422, '아이디는 영문 소문자·숫자·점·밑줄·하이픈으로 3~32자 입력해 주세요.', 'invalid_username');
  if (!allowSetup && normalized === SETUP_USERNAME) fail(422, '이 아이디는 관리자 초기 설정용으로 예약되어 있습니다.', 'reserved_username');
  return normalized;
}
function name(value: unknown, fallback = ''): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 80) fail(422, '이름은 1~80자로 입력해 주세요.', 'invalid_name');
  return value.trim();
}
function password(value: unknown, creating = true): string {
  if (typeof value !== 'string' || value.length < (creating ? 8 : 1) || value.length > 128) fail(422, creating ? '비밀번호는 8~128자로 입력해 주세요.' : '아이디와 비밀번호를 입력해 주세요.', 'invalid_password');
  return value;
}
function role(value: unknown): Role | null {
  if (value === null) return null;
  if (value !== 'admin' && value !== 'viewer') fail(422, '계정 권한을 확인해 주세요.', 'invalid_role');
  return value;
}
function status(value: unknown): Status {
  if (value !== 'pending' && value !== 'active' && value !== 'disabled') fail(422, '계정 상태를 확인해 주세요.', 'invalid_status');
  return value;
}
function fields(input: RecordValue, allowed: string[]) {
  if (Object.keys(input).some(key => !allowed.includes(key))) fail(422, '허용되지 않은 계정 설정이 포함되어 있습니다.', 'invalid_account_fields');
}
async function readBody(request: Request): Promise<RecordValue> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail(415, 'JSON 요청이 필요합니다.', 'unsupported_content_type');
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY)) fail(413, '계정 요청 크기가 너무 큽니다.', 'body_too_large');
  if (!request.body) fail(400, '계정 요청이 비어 있습니다.', 'invalid_json');
  const reader = request.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BODY) { await reader.cancel(); fail(413, '계정 요청 크기가 너무 큽니다.', 'body_too_large'); } parts.push(value); } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  let parsed: unknown; try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400, 'JSON 형식을 확인해 주세요.', 'invalid_json'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(422, '계정 요청 형식을 확인해 주세요.', 'invalid_payload');
  return parsed as RecordValue;
}
function configuration(env: AccountsEnv, admin: boolean) {
  const key = admin ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_PUBLISHABLE_KEY;
  if (!env.SUPABASE_URL || !key) fail(503, '서버의 Supabase 연결 설정이 필요합니다.', 'configuration_required');
  let url: URL; try { url = new URL(env.SUPABASE_URL); } catch { fail(503, 'Supabase URL 설정이 올바르지 않습니다.', 'configuration_required'); }
  if (url!.protocol !== 'https:' || url!.username || url!.password || url!.search || url!.hash) fail(503, 'Supabase URL 설정이 올바르지 않습니다.', 'configuration_required');
  return { url: url!.origin, key };
}
async function transport(env: AccountsEnv, fetcher: typeof fetch, path: string, method = 'GET', body?: unknown, admin = true) {
  const config = configuration(env, admin);
  let response: Response;
  try { response = await fetcher(`${config.url}/auth/v1/${path}`, { method, headers: { apikey: config.key, ...(admin ? { authorization: `Bearer ${config.key}` } : {}), 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) }); }
  catch { fail(502, '계정 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'auth_unavailable'); }
  const value: unknown = await response!.json().catch(() => null);
  if (!response!.ok) {
    const code = textValue(record(value).code) || textValue(record(value).error_code);
    if (code === 'email_exists' || code === 'user_already_exists' || response!.status === 409) fail(409, '이미 사용 중인 아이디입니다.', 'username_exists');
    if (code === 'weak_password') fail(422, '더 안전한 비밀번호를 입력해 주세요.', 'weak_password');
    if (code === 'user_banned') fail(403, '사용이 중지된 계정입니다. 관리자에게 문의해 주세요.', 'account_disabled');
    if (response!.status === 429) fail(429, '요청이 많습니다. 잠시 후 다시 시도해 주세요.', 'too_many_requests');
    if (!admin && (response!.status === 400 || response!.status === 401 || response!.status === 422)) fail(401, '아이디 또는 비밀번호가 올바르지 않습니다.', 'invalid_credentials');
    if (response!.status === 404) fail(404, '계정을 찾을 수 없습니다.', 'account_not_found');
    fail(502, '계정 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'auth_unavailable');
  }
  return { value: record(value), response: response! };
}
function authUser(value: RecordValue): RecordValue {
  const raw = record(value.user || value);
  if (!UUID.test(textValue(raw.id))) fail(502, '계정 서버 응답을 확인하지 못했습니다.', 'auth_unavailable');
  return raw;
}
async function createAccount(env: AccountsEnv, fetcher: typeof fetch, id: string, displayName: string, secret: string, accountRole: Role | null, accountStatus: Status) {
  const meta: RecordValue = { calla_username: id, calla_name: displayName, calla_status: accountStatus, ...(accountRole ? { calla_role: accountRole } : {}) };
  const result = await transport(env, fetcher, 'admin/users', 'POST', { email: emailForUsername(id), password: secret, email_confirm: true, app_metadata: meta, ...(accountStatus === 'disabled' ? { ban_duration: '876000h' } : {}) });
  return accountIdentity(authUser(result.value), env);
}
function tokenMatches(provided: unknown, expected: string) {
  if (typeof provided !== 'string' || provided.length > 512) return false;
  const encoder = new TextEncoder(), actualBytes = encoder.encode(provided), expectedBytes = encoder.encode(expected);
  return actualBytes.byteLength === expectedBytes.byteLength && timingSafeEqual(actualBytes, expectedBytes);
}

export async function accountRoute(request: Request, env: AccountsEnv, fetcher: typeof fetch, user?: { id: string; email: string; role: Role }): Promise<Response | null> {
  const url = new URL(request.url), path = url.pathname.replace(/\/$/, '');
  const publicRoute = ['/api/auth/signup', '/api/auth/login', '/api/auth/setup'].includes(path);
  const adminRoute = path === '/api/admin/users' || path.startsWith('/api/admin/users/');
  if (!publicRoute && !adminRoute) return null;
  const origin = request.headers.get('origin'); if (origin && origin !== url.origin) fail(403, '다른 출처의 요청은 허용되지 않습니다.', 'origin_denied');
  if (publicRoute) {
    if (request.method !== 'POST') fail(405, '허용되지 않은 요청 방식입니다.', 'method_not_allowed');
    const input = await readBody(request);
    if (path === '/api/auth/login') {
      fields(input, ['identifier', 'username', 'password']);
      const login = textValue(input.identifier ?? input.username).trim().toLowerCase();
      const email = login.includes('@') ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login) && login.length <= 254 ? login : fail(422, '아이디를 확인해 주세요.', 'invalid_username') : emailForUsername(username(login, true));
      const result = await transport(env, fetcher, 'token?grant_type=password', 'POST', { email, password: password(input.password, false) }, false);
      // This is the fresh Auth response, never a cached client session or user_metadata.
      ensureAccountActive(authUser(result.value), env);
      const accessToken = textValue(result.value.access_token), refreshToken = textValue(result.value.refresh_token);
      if (!accessToken || !refreshToken) fail(502, '로그인 응답을 확인하지 못했습니다.', 'auth_unavailable');
      return json({ access_token: accessToken, refresh_token: refreshToken });
    }
    if (path === '/api/auth/signup') {
      fields(input, ['username', 'name', 'password', 'signupCode']);
      const signupCode = env.CALLA_SIGNUP_CODE || '';
      if (signupCode.length < 24 || signupCode.length > 512) fail(503, '현재 회원가입을 받을 수 없습니다. 관리자에게 문의해 주세요.', 'signup_unavailable');
      if (!tokenMatches(input.signupCode, signupCode)) fail(403, '가입 코드가 올바르지 않습니다.', 'invalid_signup_code');
      const id = username(input.username);
      await createAccount(env, fetcher, id, name(input.name, id), password(input.password), null, 'pending');
      return json({ username: id, message: '가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.' }, 201);
    }
    fields(input, ['username', 'name', 'password', 'setupToken']);
    const setupToken = env.CALLA_SETUP_TOKEN || '';
    if (setupToken.length < 24 || setupToken.length > 512) fail(503, '관리자 초기 설정 키가 필요합니다.', 'setup_unavailable');
    if (!tokenMatches(input.setupToken, setupToken)) fail(403, '관리자 초기 설정 키가 올바르지 않습니다.', 'invalid_setup_token');
    if (input.username !== undefined && username(input.username, true) !== SETUP_USERNAME) fail(422, '초기 관리자 아이디는 calla-admin입니다.', 'invalid_username');
    // The fixed unique email makes concurrent setup attempts conflict in Auth.
    // An existing account is never promoted or overwritten by this endpoint.
    await createAccount(env, fetcher, SETUP_USERNAME, name(input.name, '관리자'), password(input.password), 'admin', 'active');
    return json({ username: SETUP_USERNAME, message: '관리자 계정이 생성되었습니다. 로그인해 주세요.' }, 201);
  }
  if (!user) fail(401, '로그인이 필요합니다.', 'authentication_required');
  if (user.role !== 'admin') fail(403, '관리자 권한이 필요합니다.', 'admin_required');
  if (path === '/api/admin/users' && request.method === 'GET') {
    const pageValue = url.searchParams.get('page') || '1';
    if (!/^[1-9]\d{0,4}$/.test(pageValue)) fail(422, '계정 목록 페이지를 확인해 주세요.', 'invalid_page');
    const page = Number(pageValue);
    const { value, response } = await transport(env, fetcher, `admin/users?page=${page}&per_page=${PAGE_SIZE}`);
    if (!Array.isArray(value.users)) fail(502, '계정 목록 응답을 확인하지 못했습니다.', 'auth_unavailable');
    const total = response.headers.get('x-total-count');
    const links = response.headers.get('link') || '';
    const hasMore = /;\s*rel="?next"?/.test(links) || (total !== null && /^\d+$/.test(total) ? Number(total) > page * PAGE_SIZE : value.users.length === PAGE_SIZE);
    return json({ users: value.users.slice(0, PAGE_SIZE).filter(raw => !record(raw).deleted_at).map(raw => accountIdentity(record(raw), env)), page, hasMore });
  }
  if (path === '/api/admin/users' && request.method === 'POST') {
    const input = await readBody(request); fields(input, ['username', 'name', 'password', 'role', 'status']);
    const id = username(input.username), accountRole = role(input.role === undefined ? 'viewer' : input.role), accountStatus = status(input.status ?? 'active');
    if (accountStatus === 'active' && !accountRole) fail(422, '승인할 계정의 권한을 선택해 주세요.', 'invalid_role');
    const created = await createAccount(env, fetcher, id, name(input.name, id), password(input.password), accountRole, accountStatus);
    return json({ user: created }, 201);
  }
  const id = path.slice('/api/admin/users/'.length);
  if (!UUID.test(id)) fail(422, '사용자 ID 형식이 올바르지 않습니다.', 'invalid_uuid');
  if (request.method === 'DELETE') {
    if (id === user.id) fail(409, '현재 로그인한 관리자 계정은 삭제할 수 없습니다.', 'self_account_change');
    const current = authUser((await transport(env, fetcher, `admin/users/${id}`)).value);
    if (bootstrapAccount(current)) fail(409, '초기 관리자 계정은 삭제할 수 없습니다.', 'bootstrap_account_change');
    // Supabase Auth soft deletion anonymizes the Auth identity and is irreversible.
    // Product rows are not queried or removed by account management.
    await transport(env, fetcher, `admin/users/${id}`, 'DELETE', { should_soft_delete: true });
    return json({ ok: true });
  }
  if (request.method !== 'PUT') fail(405, '허용되지 않은 요청 방식입니다.', 'method_not_allowed');
  const input = await readBody(request); fields(input, ['name', 'role', 'status', 'password']);
  if (!Object.keys(input).length) fail(422, '변경할 계정 설정이 없습니다.', 'empty_account_update');
  const nextRole = input.role === undefined ? undefined : role(input.role);
  const nextStatus = input.status === undefined ? undefined : status(input.status);
  if (id === user.id && ((nextRole !== undefined && nextRole !== 'admin') || (nextStatus !== undefined && nextStatus !== 'active'))) fail(409, '현재 로그인한 관리자의 권한이나 사용 상태는 변경할 수 없습니다.', 'self_account_change');
  const displayName = input.name === undefined ? undefined : name(input.name);
  const secret = input.password === undefined ? undefined : password(input.password);
  const current = authUser((await transport(env, fetcher, `admin/users/${id}`)).value);
  if (current.deleted_at) fail(404, '계정을 찾을 수 없습니다.', 'account_not_found');
  if (bootstrapAccount(current) && ((nextRole !== undefined && nextRole !== 'admin') || (nextStatus !== undefined && nextStatus !== 'active'))) fail(409, '초기 관리자의 권한이나 사용 상태는 변경할 수 없습니다.', 'bootstrap_account_change');
  const meta = { ...record(current.app_metadata) };
  if (displayName !== undefined) meta.calla_name = displayName;
  if (nextRole !== undefined) meta.calla_role = nextRole;
  if (nextStatus !== undefined) meta.calla_status = nextStatus;
  const projected = accountIdentity({ ...current, app_metadata: meta, ...(nextStatus !== undefined ? { banned_until: null } : {}) }, env);
  if (projected.status === 'active' && !projected.role) fail(422, '승인할 계정의 권한을 선택해 주세요.', 'invalid_role');
  // Auth merges app_metadata. Send only changed keys so concurrent name edits
  // cannot restore another administrator's earlier approval or role value.
  const metadataPatch = { ...(displayName !== undefined ? { calla_name: displayName } : {}), ...(nextRole !== undefined ? { calla_role: nextRole } : {}), ...(nextStatus !== undefined ? { calla_status: nextStatus } : {}) };
  const payload = { ...(Object.keys(metadataPatch).length ? { app_metadata: metadataPatch } : {}), ...(secret !== undefined ? { password: secret } : {}), ...(nextStatus !== undefined ? { ban_duration: nextStatus === 'disabled' ? '876000h' : 'none' } : {}) };
  const changed = authUser((await transport(env, fetcher, `admin/users/${id}`, 'PUT', payload)).value);
  return json({ user: accountIdentity(changed, env) });
}
