import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../server/index.ts';

const ID = '33333333-3333-4333-8333-333333333333';
const env = {
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-public',
  SUPABASE_SERVICE_ROLE_KEY: 'test-secret', ADMIN_EMAILS: '',
  AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
  ASSETS: { fetch: async () => new Response('asset') },
} as unknown as Env;
const result = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const request = (path: string, method = 'GET', payload?: unknown, origin?: string) => new Request(`https://calla.test${path}`, {
  method, headers: { authorization: 'Bearer stale-token', ...(payload ? { 'content-type': 'application/json' } : {}), ...(origin ? { origin } : {}) },
  ...(payload ? { body: JSON.stringify(payload) } : {}),
});

test('administrator endpoints enforce the current server role before Auth admin transport', async () => {
  const calls: string[] = [];
  const worker = createWorker({ fetch: (async input => {
    calls.push(String(input));
    assert.equal(new URL(String(input)).pathname, '/auth/v1/user');
    return result({ id: ID, email: 'viewer@example.com', app_metadata: { calla_role: 'viewer' } });
  }) as typeof fetch });
  for (const [method, path, payload] of [
    ['GET', '/api/admin/users', undefined], ['POST', '/api/admin/users', { username: 'someone' }],
    ['PUT', `/api/admin/users/${ID}`, { role: 'admin' }], ['DELETE', `/api/admin/users/${ID}`, undefined],
  ] as const) assert.equal((await worker.fetch(request(path, method, payload), env)).status, 403);
  assert.equal(calls.length, 4);
});

test('suspended, pending and invalid statuses reject existing sessions and email overrides', async () => {
  for (const status of ['pending', 'disabled', 'invalid']) {
    const worker = createWorker({ fetch: (async () => result({
      id: ID, email: 'owner@example.com', email_confirmed_at: '2026-10-01T00:00:00Z',
      app_metadata: { calla_role: 'admin', calla_status: status },
    })) as typeof fetch });
    for (const path of ['/api/me', '/api/admin/users', '/api/lists']) {
      const response = await worker.fetch(request(path), { ...env, ADMIN_EMAILS: 'owner@example.com' });
      assert.equal(response.status, 403, `${status}: ${path}`);
    }
  }
});

test('public account requests are rate limited and cross-origin requests never reach Auth', async () => {
  let outbound = 0;
  const worker = createWorker({ fetch: (async () => { outbound++; throw new Error('Auth must not be called'); }) as typeof fetch });
  const limitedEnv = { ...env, AUTH_RATE_LIMITER: { limit: async () => ({ success: false }) } } as unknown as Env;
  for (const path of ['/api/auth/login', '/api/auth/signup', '/api/auth/setup']) {
    const response = await worker.fetch(request(path, 'POST', {}), limitedEnv);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '60');
    assert.equal((await worker.fetch(request(path, 'POST', {}, 'https://evil.test'), env)).status, 403);
  }
  assert.equal(outbound, 0);
});

test('public account endpoints fail closed if the limiter binding is missing', async () => {
  const worker = createWorker({ fetch: (async () => { throw new Error('Auth must not be called'); }) as typeof fetch });
  const response = await worker.fetch(request('/api/auth/signup', 'POST', {}), { ...env, AUTH_RATE_LIMITER: undefined } as unknown as Env);
  assert.equal(response.status, 503);
});
