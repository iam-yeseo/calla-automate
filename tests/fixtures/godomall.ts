import { createWorker } from '../../server/index';
import { prepareInsert } from '../../server/godomall-mapping';
import { canonicalXml, child, children, parseXml, setValue, value, xmlNode, type XmlNode } from '../../server/godomall-xml';
import { newProduct } from '../../src/domain';

export const API_ITEM = '22222222-2222-4222-8222-222222222222';
export const API_USER = '33333333-3333-4333-8333-333333333333';
export const API_LIST = '11111111-1111-4111-8111-111111111111';
export const defaultInsertCodes = { deliverySno: '1', detailInfoDelivery: '002001', detailInfoAS: '003001', detailInfoRefund: '004001' };
export function sourceProduct() {
  const p = newProduct(API_LIST, 1); Object.assign(p, { id: API_ITEM, brand: 'CALLA', name_own: '<b>칼라 상품 & 테스트</b>', model: 'MODEL_1', price_retail: 1000, price_retail_regular: 1500, price_wholesale: 800, price_wholesale_master: 800, updated_at: '2026-10-07T00:00:00.000Z', image_url: 'https://example.test/image.jpg' });
  p.automation.categoryCodes = { retail: '001001', wholesale: '002001' }; p.automation.origin = '대한민국'; p.automation.detailHtml = '<div>한글 & <img src="https://example.test/a?x=1&y=2"> ]]> 원문</div>';
  return p;
}
export function remoteNode(no = '1000000001') {
  const mapped = prepareInsert(sourceProduct(), 'retail', 'CA_test', { ...defaultInsertCodes, scmNo: '1', brandCd: '001' });
  const node = mapped.node; setValue(node, 'goodsNo', no); return node;
}
export const xmlResponse = (nodes: XmlNode[] = [], code = '000', paging: { total?: number; page?: number; maxPage?: number } = {}) => `<?xml version="1.0" encoding="UTF-8"?><data><header><code>${code}</code><msg>test fixture</msg>${paging.total !== undefined ? `<total>${paging.total}</total><max_page>${paging.maxPage ?? 1}</max_page><now_page>${paging.page ?? 1}</now_page>` : ''}</header><return>${nodes.map(canonicalXml).join('')}</return></data>`;
export const apiRequest = (path: string, method = 'GET', body?: unknown, user = API_USER) => new Request(`https://calla.test/api${path}`, { method, headers: { authorization: `Bearer ${user}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

export function apiHarness() {
  type Row = Record<string, any>;
  const tables: Record<string, Row[]> = { godomall_taxonomy_sync: [], product_items: [sourceProduct()], product_registrations: [], godomall_operations: [], godomall_links: [], godomall_products: [], godomall_mall_state: ['retail', 'wholesale'].map(mall_id => ({ mall_id, connection_state: 'unchecked' })) };
  const remote = { retail: new Map<string, XmlNode>(), wholesale: new Map<string, XmlNode>() };
  const calls: { mall: string; endpoint: string; params: URLSearchParams }[] = [];
  const modes = { insert: 'normal', delete: 'normal', update: 'normal', role: 'admin', failSearch: false, taxonomyTree: false };
  const codeRows: Record<'retail' | 'wholesale', Record<string, XmlNode[]>> = { retail: {}, wholesale: {} };
  for (const mall of ['retail', 'wholesale'] as const) {
    const guide = (code: string, name: string) => [xmlNode('code_data', '', [xmlNode('informCd', code), xmlNode('informNm', name)])];
    codeRows[mall] = {
      delivery: [xmlNode('code_data', '', [xmlNode('sno', mall === 'retail' ? '1' : '10'), xmlNode('method', mall === 'retail' ? '배송방법' : '칼라배송')])],
      deliveryInfo: guide(mall === 'retail' ? '002001' : '002091', '배송안내 - 기본'),
      asInfo: guide(mall === 'retail' ? '003001' : '003091', 'AS안내 - 기본'),
      refundInfo: guide(mall === 'retail' ? '004001' : '004091', '환불안내 - 기본'),
    };
  }
  const env = { SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'publishable', SUPABASE_SERVICE_ROLE_KEY: 'service-private', GODOMALL_PUBLIC_ORIGIN: 'https://calla.test', GODOMALL_PARTNER_KEY: 'partner-private', GODOMALL_CALLAMEDIA_API_USER_KEY: 'retail-private', GODOMALL_CALLAMEDIA1_API_USER_KEY: 'wholesale-private', ADMIN_EMAILS: '', ASSETS: { fetch: async () => new Response('asset') } } as unknown as Env;
  const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  const filter = (rows: Row[], query: URLSearchParams) => rows.filter(row => [...query].every(([key, rule]) => {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) return true;
    if (rule.startsWith('eq.')) return String(row[key]) === rule.slice(3);
    if (rule.startsWith('in.(')) return rule.slice(4, -1).split(',').includes(String(row[key]));
    if (rule === 'is.null') return row[key] === null || row[key] === undefined;
    if (rule.startsWith('gt.')) return String(row[key]) > rule.slice(3);
    throw Error(`Unknown filter ${key} ${rule}`);
  }));
  const worker = createWorker({ fetch: (async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === 'db.test') {
      if (url.pathname === '/auth/v1/user') return response({ id: new Headers(init.headers).get('authorization')!.slice(7), email: 'fixture@test.example', app_metadata: { calla_role: modes.role } });
      const resource = url.pathname.replace('/rest/v1/', ''), payload = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      if (resource === 'rpc/godomall_reserve_call') return response(new Date(Date.now() - 1).toISOString());
      if (resource === 'rpc/godomall_pause_calls') return response(null);
      if (resource === 'rpc/godomall_begin_operation') {
        const op = tables.godomall_operations.find(o => o.id === payload.p_id)!;
        if (op.state !== 'prepared') return response({ started: false, operation: op });
        if (tables.godomall_operations.some(o => o.id !== op.id && o.mall_id === op.mall_id && o.target_key === op.target_key && ['sending', 'verifying', 'needs_review'].includes(o.state))) return response({ code: '23505' }, 409);
        if (op.kind === 'insert' && tables.product_items.find(p => p.id === op.item_id)?.updated_at !== op.source_revision) return response({ code: 'P0001' }, 400);
        Object.assign(op, { state: 'sending', payload_token_hash: payload.p_token_hash, payload_expires_at: new Date(Date.now() + 600000).toISOString(), updated_at: new Date().toISOString() });
        return response({ started: true, operation: op });
      }
      if (resource === 'rpc/godomall_finish_operation') {
        const op = tables.godomall_operations.find(o => o.id === payload.p_id)!;
        if (!['success', 'failed'].includes(op.state)) Object.assign(op, { state: payload.p_state, goods_no: payload.p_goods_no || op.goods_no, error_message: payload.p_error, checked_at: payload.p_state === 'success' ? new Date().toISOString() : null });
        return response(op);
      }
      const rows = tables[resource]; if (!rows) throw Error(`Unknown table ${resource}`);
      const matches = filter(rows, url.searchParams);
      if (init.method === 'PATCH') { matches.forEach(row => Object.assign(row, payload)); return response(matches); }
      if (init.method === 'POST') {
        const incoming = (Array.isArray(payload) ? payload : [payload]).map(row => ({ error_message: null, checked_at: null, response_code: null, verification_attempts: 0, payload_token_hash: null, payload_expires_at: null, ...row }));
        const keys = url.searchParams.get('on_conflict')?.split(',');
        for (const row of incoming) { const old = keys && rows.find(r => keys.every(key => r[key] === row[key])); if (old) Object.assign(old, row); else rows.push(row); }
        return response(incoming);
      }
      const start = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || rows.length);
      return response(matches.slice(start, start + limit));
    }
    if (url.hostname !== 'openhub.godo.co.kr') throw Error(`Unexpected host ${url.hostname}`);
    const params = new URLSearchParams(String(init.body)), mall = params.get('key') === 'retail-private' ? 'retail' : 'wholesale';
    const endpoint = url.pathname.split('/').pop()!; calls.push({ mall, endpoint, params });
    if (endpoint === 'Goods_Search.php') {
      if (modes.failSearch) throw Error('offline');
      let nodes = [...remote[mall].values()].filter(n => !params.get('goodsNo') || value(n, 'goodsNo') === params.get('goodsNo')).filter(n => !params.get('goodsCd') || value(n, 'goodsCd') === params.get('goodsCd'));
      const total = nodes.length, page = Number(params.get('page') || 1), size = Number(params.get('size') || 50); nodes = nodes.slice((page - 1) * size, page * size);
      return new Response(xmlResponse(nodes, '000', { total, page, maxPage: Math.ceil(total / size) }));
    }
    if (['Category_Search.php', 'Brand_Search.php', 'Code_Search.php'].includes(endpoint)) {
      if (endpoint === 'Code_Search.php' && params.get('code_type')! in codeRows[mall]) return new Response(xmlResponse(codeRows[mall][params.get('code_type')!]));
      if (modes.taxonomyTree && endpoint !== 'Code_Search.php') {
        const root = endpoint === 'Brand_Search.php' ? (mall === 'retail' ? '001' : '027') : (mall === 'retail' ? '001' : '002');
        const parent = params.get('cateCd') || '', codes = parent === '' ? [root] : endpoint === 'Category_Search.php' && parent === root ? [root + '001'] : [];
        return new Response(xmlResponse(codes.map(code => xmlNode('code_data', '', [xmlNode('cateCd', code), xmlNode('cateNm', endpoint === 'Brand_Search.php' ? 'CALLA' : `분류 ${code}`), xmlNode('cateDisplayFl', 'y'), xmlNode('cateDisplayMobileFl', 'y')]))));
      }
      const taxonomy = endpoint !== 'Code_Search.php', code = taxonomy ? (endpoint === 'Brand_Search.php' ? '001' : mall === 'retail' ? '001001' : '002001') : '1';
      const codeField = taxonomy ? 'cateCd' : params.get('code_type') === 'scm' ? 'scmNo' : 'sno';
      return new Response(xmlResponse([xmlNode('code_data', '', [xmlNode(codeField, code), xmlNode(taxonomy ? 'cateNm' : params.get('code_type') === 'scm' ? 'companyNm' : 'method', 'CALLA')])]));
    }
    if (endpoint === 'Goods_Insert.php' || endpoint === 'Goods_Update.php') {
      const payload = await worker.fetch(new Request(params.get('data_url')!), env);
      if (!payload.ok) throw Error(`payload rejected ${payload.status}`);
      const node = child(parseXml(await payload.text()), 'goods_data')!;
      const goodsNo = endpoint === 'Goods_Insert.php' ? '1000000001' : value(node, 'goodsNo')!;
      setValue(node, 'goodsNo', goodsNo);
      if (endpoint === 'Goods_Insert.php' && value(node, 'imageStorage') === 'local') {
        for (const [field, slot] of [['magnifyImageData', 'magnify'], ['detailImageData', 'detail'], ['listImageData', 'list'], ['mainImageData', 'main']]) {
          if (modes.insert === 'image-source-echo') continue;
          if (modes.insert === `missing-image-${slot}`) { node.children = node.children.filter(n => n.name !== field); continue; }
          for (const image of children(node, field)) {
            image.text = `https://images.${mall}.test/goods/${goodsNo}/image/${slot}/${goodsNo}_${slot}_001.jpg`;
            image.attributes = { idx: '1' };
          }
        }
        if (modes.insert === 'image-storage-url') setValue(node, 'imageStorage', 'url');
      }
      if (endpoint === 'Goods_Update.php') {
        const old = remote[mall].get(goodsNo)!;
        if (value(node, 'imageUpdate') === 'N') node.children.push(...old.children.filter(n => n.name.endsWith('ImageData')));
        if (modes.update === 'lose-options') node.children = node.children.filter(n => n.name !== 'goodsMustInfoData');
      }
      remote[mall].set(goodsNo, node);
      if (endpoint === 'Goods_Insert.php' && modes.insert === 'timeout-after-create') throw Error('timeout after remote commit');
      if (endpoint === 'Goods_Insert.php' && modes.insert === 'no-identifier') return new Response(xmlResponse());
      return new Response(xmlResponse([xmlNode('goods_data', '', [xmlNode('goodsNo', goodsNo)])]));
    }
    if (endpoint === 'Goods_Delete.php') {
      if (modes.delete === 'timeout') { remote[mall].delete(params.get('goodsNo')!); throw Error('lost receipt'); }
      if (modes.delete === 'missing-id') return new Response(xmlResponse());
      remote[mall].delete(params.get('goodsNo')!);
      return new Response(xmlResponse([xmlNode('goods_data', '', [xmlNode('goodsNo', params.get('goodsNo')!)])]));
    }
    throw Error(`Unexpected endpoint ${endpoint}`);
  }) as typeof fetch });
  return { worker, env, remote, calls, modes, codeRows, tables, request: (path: string, method = 'GET', body?: unknown, user = API_USER) => worker.fetch(apiRequest(path, method, body, user), env) };
}
