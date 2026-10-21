import test from 'node:test';
import assert from 'node:assert/strict';
import { GodomallClient, type GodomallSecrets, type RateGate } from '../server/godomall-client';
import { GodomallError } from '../server/godomall-xml';

const secrets: GodomallSecrets = { GODOMALL_PARTNER_KEY: 'private-partner', GODOMALL_CALLAMEDIA_API_USER_KEY: 'private-retail' };
const success = '<data><header><code>000</code></header><return/></data>';
const rayId = '9cf831704cad1234-ICN';
const cloudflare = { server: 'cloudflare', 'cf-ray': rayId };
const noGate: RateGate = { reserve: async () => {}, pause: async () => {} };
const httpError = (error: unknown) => error instanceof GodomallError && error.code === 'godomall_http';

test('all read endpoints retry transient failures with bounded backoff and a fresh rate reservation', async t => {
  const logs: unknown[] = []; t.mock.method(console, 'warn', (...args: unknown[]) => logs.push(args));
  for (const endpoint of ['search', 'categories', 'brands', 'codes'] as const) {
    const events: string[] = []; let calls = 0;
    const gate: RateGate = { ...noGate, reserve: async () => { events.push('reserve'); } };
    const client = new GodomallClient(secrets, 'retail', async () => {
      events.push('fetch'); calls++;
      if (calls === 1) return new Response('error code: 1016', { status: 530, headers: cloudflare });
      if (calls === 2) return new Response('<h1>Error 1001</h1>', { status: 409, headers: cloudflare });
      return new Response(success);
    }, gate, async ms => { events.push(`wait:${ms}`); });
    assert.equal((await client.call(endpoint)).code, '000');
    assert.deepEqual(events, ['reserve', 'fetch', 'wait:400', 'reserve', 'fetch', 'wait:900', 'reserve', 'fetch']);
  }
  assert.equal(logs.length, 8);
  assert.match(JSON.stringify(logs), /cloudflareCode.*1016/);
});

test('read retries stop after three attempts and retain the final safe diagnostic', async t => {
  t.mock.method(console, 'warn', () => {});
  let calls = 0, reservations = 0; const waits: number[] = [];
  const client = new GodomallClient(secrets, 'retail', async () => {
    calls++;
    return new Response('ignored private-partner private-retail', { status: 530, headers: { ...cloudflare, 'cf-error-type': '1016', 'cf-error-origin': 'dns' } });
  }, { ...noGate, reserve: async () => { reservations++; } }, async ms => { waits.push(ms); });
  await assert.rejects(client.call('search'), (error: unknown) => {
    assert.ok(error instanceof GodomallError); assert.equal(error.uncertain, false);
    assert.match(error.message, /서버 주소/); assert.match(error.message, /530; CF 1016, Ray 9cf831704cad1234-ICN/);
    assert.doesNotMatch(error.message, /private-/); return true;
  });
  assert.equal(calls, 3); assert.equal(reservations, 3); assert.deepEqual(waits, [400, 900]);
});

test('ordinary 409 conflicts, untrusted error text, auth codes, redirects and stable CF errors never retry', async t => {
  t.mock.method(console, 'warn', () => {});
  const cases: { status: number; body: string; headers: Record<string, string> }[] = [
    { status: 409, body: 'Conflict', headers: cloudflare },
    { status: 409, body: 'Error 1001', headers: {} },
    { status: 409, body: '<data><header><code>898</code></header></data>', headers: { ...cloudflare, 'cf-error-type': '1001' } },
    { status: 503, body: '<data><header><code>999</code></header></data>', headers: cloudflare },
    { status: 530, body: 'Error 1000', headers: cloudflare },
    { status: 302, body: '', headers: { location: 'https://untrusted.example/' } },
    { status: 403, body: 'private-partner', headers: {} },
  ];
  for (const fixture of cases) {
    let calls = 0;
    const client = new GodomallClient(secrets, 'retail', async () => { calls++; return new Response(fixture.body, fixture); }, noGate, async () => assert.fail('must not retry'));
    await assert.rejects(client.call('search'), GodomallError); assert.equal(calls, 1);
  }
});

test('insert and update are never replayed for any HTTP, network or body failure; deletion stays blocked', async t => {
  t.mock.method(console, 'warn', () => {});
  for (const endpoint of ['insert', 'update', 'delete'] as const) {
    for (const mode of ['409', '530', '503', 'network', 'body'] as const) {
      let calls = 0;
      const client = new GodomallClient(secrets, 'retail', async () => {
        calls++;
        if (mode === 'network') throw Error('private-retail');
        if (mode === 'body') return new Response(new ReadableStream({ start(controller) { controller.error(Error('private-partner')); } }));
        return new Response('error code: 1001', { status: Number(mode), headers: cloudflare });
      }, noGate, async () => assert.fail('writes must not retry'));
      await assert.rejects(client.call(endpoint, { data_url: 'https://example.test/private-payload.xml' }), (error: unknown) => {
        assert.ok(error instanceof GodomallError);
        assert.equal(error.uncertain, endpoint !== 'delete'); assert.doesNotMatch(error.message, /private-/); return true;
      });
      assert.equal(calls, endpoint === 'delete' ? 0 : 1);
    }
  }
});

test('error bodies are capped and cancelled before the next request; arbitrary diagnostic fields never escape', async t => {
  const logs: unknown[] = []; t.mock.method(console, 'warn', (...args: unknown[]) => logs.push(args));
  let cancelled = false, calls = 0;
  const client = new GodomallClient(secrets, 'retail', async () => {
    calls++;
    if (calls > 1) { assert.equal(cancelled, true); return new Response(success); }
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('private-retail '.repeat(2000))); },
      cancel() { cancelled = true; },
    }), { status: 530, headers: { 'cf-ray': 'private-retail', 'cf-error-type': 'private-partner', 'cf-error-origin': 'private-retail', 'x-debug': 'private-partner' } });
  }, noGate, async () => {});
  assert.equal((await client.call('search')).code, '000'); assert.equal(cancelled, true);
  assert.doesNotMatch(JSON.stringify(logs), /private-|x-debug/);
  assert.deepEqual(logs[0], ['godomall_upstream_http', { mall: 'retail', endpoint: 'search', status: 530, attempt: 1 }]);
});

test('even format-valid diagnostic values are discarded when they contain a configured secret', async t => {
  const logs: unknown[] = []; t.mock.method(console, 'warn', (...args: unknown[]) => logs.push(args));
  const client = new GodomallClient({ GODOMALL_PARTNER_KEY: rayId, GODOMALL_CALLAMEDIA_API_USER_KEY: '1001' }, 'retail', async () =>
    new Response('Error 1001', { status: 409, headers: { ...cloudflare, 'cf-error-type': '1001' } }), noGate, async () => assert.fail('must not retry'));
  await assert.rejects(client.call('search'), (error: unknown) => {
    assert.ok(error instanceof GodomallError); assert.doesNotMatch(error.message, /1001|9cf831/); return true;
  });
  assert.doesNotMatch(JSON.stringify(logs), /1001|9cf831/);
});

test('429 and exhausted read responses pause admission and stop without an automatic retry', async t => {
  t.mock.method(console, 'warn', () => {});
  for (const status of [429, 530, 200]) {
    let calls = 0; const pauses: number[] = [];
    const client = new GodomallClient(secrets, 'retail', async () => {
      calls++; return new Response(status === 200 ? success : 'Error 1016', { status, headers: { ...cloudflare, 'ratelimit-available-level': 'EXHAUSTED', 'retry-after': '7' } });
    }, { ...noGate, pause: async (_, ms) => { pauses.push(ms); } }, async () => assert.fail('must not retry'));
    if (status === 200) assert.equal((await client.call('search')).code, '000');
    else await assert.rejects(client.call('search'), GodomallError);
    assert.equal(calls, 1); assert.deepEqual(pauses, [7000]);
  }
});

test('retry admission failure never reaches the upstream and cannot be retried as a transport error', async t => {
  t.mock.method(console, 'warn', () => {});
  let reservations = 0, calls = 0;
  const blocked = new GodomallError(429, '호출 대기', 'godomall_rate_limited');
  const client = new GodomallClient(secrets, 'retail', async () => { calls++; return new Response('', { status: 503 }); }, {
    ...noGate, reserve: async () => { if (++reservations === 2) throw blocked; },
  }, async () => {});
  await assert.rejects(client.call('search'), error => error === blocked);
  assert.equal(calls, 1); assert.equal(reservations, 2);
});

test('network failures retry reads but never echo the exception or submitted values', async t => {
  const logs: unknown[] = []; t.mock.method(console, 'warn', (...args: unknown[]) => logs.push(args));
  let calls = 0;
  const client = new GodomallClient(secrets, 'retail', async () => {
    calls++; if (calls < 3) throw Error('private-retail private-product'); return new Response(success);
  }, noGate, async () => {});
  assert.equal((await client.call('search', { goodsNm: 'private-product' })).code, '000'); assert.equal(calls, 3);
  assert.doesNotMatch(JSON.stringify(logs), /private-/);
});

test('read aggregate budget prevents another upstream call after rate-gate wait consumes the deadline', async t => {
  t.mock.method(console, 'warn', () => {});
  let now = 100000, calls = 0, reservations = 0;
  t.mock.method(Date, 'now', () => now);
  const client = new GodomallClient(secrets, 'retail', async () => { calls++; return new Response('', { status: 530 }); }, {
    ...noGate, reserve: async () => { if (++reservations === 2) now += 28000; },
  }, async () => {});
  await assert.rejects(client.call('search'), httpError); assert.equal(calls, 1); assert.equal(reservations, 2);
});

test('a blocked read rate reservation cannot hold the caller past the total deadline or fetch later', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let release!: () => void, calls = 0;
  const client = new GodomallClient(secrets, 'retail', async () => { calls++; return new Response(success); }, {
    ...noGate, reserve: () => new Promise<void>(resolve => { release = resolve; }),
  });
  const result = client.call('search');
  const rejection = assert.rejects(result, (error: unknown) => error instanceof GodomallError && error.code === 'godomall_network');
  t.mock.timers.tick(28000);
  await rejection;
  release(); await Promise.resolve();
  assert.equal(calls, 0);
});

test('a read fetch that ignores AbortSignal is bounded and any late body is cancelled without another request', async t => {
  const logs: unknown[] = []; t.mock.method(console, 'warn', (...args: unknown[]) => logs.push(args));
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let release!: (response: Response) => void, calls = 0, cancelled = false;
  const client = new GodomallClient(secrets, 'retail', async () => {
    calls++;
    return new Promise<Response>(resolve => { release = resolve; });
  }, noGate, async () => assert.fail('a timed-out fetch must not restart'));
  const result = client.call('search');
  const rejection = assert.rejects(result, (error: unknown) => error instanceof GodomallError && error.code === 'godomall_network');
  for (let i = 0; i < 10 && !calls; i++) await Promise.resolve();
  assert.equal(calls, 1);
  t.mock.timers.tick(28000);
  await rejection;
  release(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  for (let i = 0; i < 10 && !cancelled; i++) await Promise.resolve();
  assert.equal(cancelled, true); assert.equal(calls, 1);
  assert.deepEqual(logs, [['godomall_upstream_timeout', { mall: 'retail', endpoint: 'search', attempt: 1, phase: 'headers' }]]);
});

test('read timeouts preserve the original first-attempt allowance and shrink to the remaining aggregate budget', async t => {
  t.mock.method(console, 'warn', () => {});
  let now = 100000, calls = 0; const timeouts: number[] = [];
  t.mock.method(Date, 'now', () => now);
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { timeouts.push(ms); return new AbortController().signal; });
  const client = new GodomallClient(secrets, 'retail', async () => {
    calls++; if (calls === 1) { now += 20000; throw Error('timeout'); } return new Response(success);
  }, noGate, async ms => { now += ms; });
  assert.equal((await client.call('search')).code, '000'); assert.deepEqual(timeouts, [20000, 7600]);
});

test('short Retry-After is honored and long Retry-After leaves an explicit later lookup', async t => {
  t.mock.method(console, 'warn', () => {});
  for (const seconds of [3, 60]) {
    let calls = 0; const waits: number[] = [];
    const client = new GodomallClient(secrets, 'retail', async () => {
      calls++; return calls === 1 ? new Response('', { status: 503, headers: { 'retry-after': String(seconds) } }) : new Response(success);
    }, noGate, async ms => { waits.push(ms); });
    if (seconds === 3) { assert.equal((await client.call('search')).code, '000'); assert.deepEqual(waits, [3000]); }
    else { await assert.rejects(client.call('search'), httpError); assert.deepEqual(waits, []); }
  }
});
