import { createServer, type IncomingMessage } from 'node:http';
import { require as tsxRequire } from 'tsx/cjs/api';
import { apiHarness, API_LIST, remoteNode, sourceProduct } from '../../../tests/fixtures/godomall';
import { setValue } from '../../../server/godomall-xml';
const { demoApi } = tsxRequire('../../../src/demo.ts', import.meta.url);
const { SUPABASE_PROJECT_REF } = tsxRequire('../../config.cjs', import.meta.url);

export const AUTH_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co`;
const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
export const TOKEN = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: 'preview-admin', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.${part('fixture-signature')}`;
export const AUTH_USER = { id: 'preview-admin', aud: 'authenticated', email: 'fixture@example.test', role: 'authenticated', app_metadata: { calla_role: 'admin' }, user_metadata: {}, created_at: '2026-10-02T00:00:00Z' };
export const PREVIEW_IMAGE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAAm0lEQVR4nO3QMQ0AIADAMEQjBK0YAA88ZEmP/UvHnuvovfF7oB5AgADTAQQIMB1AgADTAQQIMB1AgADTAQQIMB1AgADTAQQIMB1AgADTAQQIMB1AgADTAQQIMB1AgADTAQQIMB1AgADTAQQIMB1AgADTAQQIMB1AgADTAQQIMB1AgADTAQQIMB1AgADTAQQIMB1AgADTAQQIMB1AgADTAQQIMB1AgADTAQQIMN0FdPPxSLkZ+44AAAAASUVORK5CYII=', 'base64');
export const REGISTRATION_PRODUCT_NAME = '<b onclick="document.body.dataset.previewNameScriptRan=\'yes\'">칼라 상품 & 테스트</b>';
// Sandboxed srcdoc images bypass Playwright routing in Chromium. Inline only
// the fixture detail image; real external images are checked in live QA.
export const REGISTRATION_DETAIL_HTML = '<article><h2>등록할 상세설명</h2><p>한글 &amp; 상세 본문</p><img src="data:image/png;base64,' + PREVIEW_IMAGE_PNG.toString('base64') + '" alt="등록 상세 이미지" onload="document.documentElement.dataset.previewScriptRan=\'yes\'"/><div style="height:1200px">긴 상세페이지 본문</div><p>상세페이지 마지막 확인</p></article><script>document.documentElement.dataset.previewScriptRan="yes";parent.document.body.dataset.previewScriptRan="yes"</script>';
export async function startFixture(options: { godomall?: boolean; respond?: (route: string, method: string, body: string) => unknown; mapResponse?: (route: string, method: string, result: unknown) => unknown } = {}) {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) }, configurable: true });
  const calls: { path: string; method: string }[] = [];
  const godomall = options.godomall ? apiHarness() : null;
  if (godomall) {
    godomall.modes.taxonomyTree = true;
    const p = godomall.tables.product_items[0]; p.automation.detailBlocks = [{ id: 'text-1', type: 'text', text: '<p>등록할 상세설명</p>' }];
    for (let i=1;i<=55;i++) { const node=remoteNode(String(1000000000+i)); setValue(node,'goodsNm',`소매 API 상품 ${i}`); godomall.remote.retail.set(String(1000000000+i),node); }
    const node=remoteNode();setValue(node,'goodsNm','도매 API 상품');godomall.remote.wholesale.set('1000000001',node);
  }
  let offline = false;
  const server = createServer(async (req: IncomingMessage, res) => {
    const route = (req.url || '').replace(/^\/api/, '');
    calls.push({ path: route, method: req.method || 'GET' });
    res.setHeader('Content-Type', 'application/json');
    if (offline) { res.statusCode = 503; res.end(JSON.stringify({ error: '연결 테스트: 서버에 연결할 수 없습니다.' })); return; }
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      let result: unknown;
      const override = options.respond?.(route, req.method || 'GET', body);
      if (override !== undefined) result = override;
      else if (route === '/config') result = { supabaseUrl: AUTH_URL, supabasePublishableKey: 'sb_publishable_fixture' };
      else if (route === '/auth/login') result = { access_token: TOKEN, refresh_token: 'fixture-refresh-token' };
      else {
        if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.statusCode = 401; res.end(JSON.stringify({ error: '로그인이 필요합니다.' })); return; }
        if(godomall && (route.startsWith('/godomall/') || /^\/items\/[^/]+$/.test(route))) {
          const response=await godomall.request(route,req.method,body?JSON.parse(body):undefined);
          res.statusCode=response.status; result=await response.json();
        } else if(godomall && route==='/lists') result={lists:[{id:API_LIST,title:'API 테스트 리스트',author:'검증',work_date:'2026-10-07',created_at:'2026-10-07T00:00:00Z',total:1}]};
        else if(godomall && route===`/lists/${API_LIST}` && req.method==='GET') result={list:{id:API_LIST,title:'API 테스트 리스트',author:'검증',work_date:'2026-10-07',created_at:'2026-10-07T00:00:00Z',total:1}};
        else if(godomall && route===`/lists/${API_LIST}/items`)result={items:godomall.tables.product_items};
        else if(godomall && route===`/lists/${API_LIST}/registrations`)result={registrations:godomall.tables.product_registrations};
        else if(godomall && route==='/settings' && req.method==='GET')result={value:{schemaVersion:1,folders:['audio'],brands:[],categories:{retail:[{code:'001',name:'소매 분류',parentCode:''},{code:'001001',name:'소매 하위',parentCode:'001'}],wholesale:[{code:'002',name:'도매 분류',parentCode:''},{code:'002001',name:'도매 하위',parentCode:'002'}]},brandsByMall:{retail:[{code:'001',name:'CALLA'}],wholesale:[{code:'027',name:'CALLA'}]}},updated_at:'2026-10-07T00:00:00Z'};
        else result = await demoApi(route, { method: req.method, body: body || undefined }, 'admin');
      }
      res.end(JSON.stringify(options.mapResponse?.(route, req.method || 'GET', result) ?? result));
    } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: (error as Error).message })); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`, calls, data, godomall, setOffline(value: boolean) { offline = value; }, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}
