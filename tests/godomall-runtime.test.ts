import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

test('Godomall requests and XML parsing work in the deployed Workers runtime', async () => {
  const { outputFiles } = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'godomall-runtime-fixture.ts', contents: `
      import { GodomallClient } from './server/godomall-client.ts';
      export default { async fetch() {
        const results = [];
        for (const status of [200, 302, 530, 409]) {
          let calls = 0;
          const client = new GodomallClient({ GODOMALL_PARTNER_KEY: 'fixture-partner', GODOMALL_CALLAMEDIA_API_USER_KEY: 'fixture-user' }, 'retail', async (url, init) => {
            calls++;
            // Workerd validates RequestInit more narrowly than Node's fetch.
            const request = new Request(url, init);
            if (request.redirect !== 'manual') throw Error('Credentials must never follow redirects');
            if ([530, 409].includes(status) && calls === 1) return new Response('error code: ' + (status === 409 ? '1001' : '1016'), { status, headers: { server: 'cloudflare', 'cf-ray': '9cf831704cad1234-ICN' } });
            return status === 302
              ? new Response(null, { status, headers: { location: 'https://untrusted.example/' } })
              : new Response('<data><header><code>000</code><total>1</total><max_page>1</max_page><now_page>1</now_page></header><return><goods_data><goodsNo>001</goodsNo><goodsNm><![CDATA[한글 & 상품]]></goodsNm></goods_data></return></data>');
          }, { reserve: async () => {}, pause: async () => {} }, async () => {});
          try { const result = await client.search({ size: '1' }); results.push({ status, calls, name: result.page.goods[0].name }); }
          catch (e) { results.push({ status, calls, error: e.code }); }
        }
        return Response.json(results);
      } };
    ` },
    bundle: true, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], write: false,
  });
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'godomall-runtime-test', compatibilityDate: '2026-09-30', compatibilityFlags: ['nodejs_compat'],
    manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: outputFiles[0].text } } },
  } }] });
  try {
    const response = await runtime.dispatchFetch('http://fixture/');
    assert.deepEqual(await response.json(), [
      { status: 200, calls: 1, name: '한글 & 상품' },
      { status: 302, calls: 1, error: 'godomall_http' },
      { status: 530, calls: 2, name: '한글 & 상품' },
      { status: 409, calls: 2, name: '한글 & 상품' },
    ]);
  } finally { await runtime.dispose(); }
});
