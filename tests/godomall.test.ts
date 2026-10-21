import test from 'node:test';
import assert from 'node:assert/strict';
import { credentials, GodomallClient, normalizeGoods, preservationIssues, type RateGate } from '../server/godomall-client';
import { mismatches, prepareInsert, prepareUpdate } from '../server/godomall-mapping';
import { canonicalXml, child, children, documentXml, GodomallError, parseXml, responseData, setValue, value, xmlNode } from '../server/godomall-xml';
import { apiHarness, API_ITEM, defaultInsertCodes, API_USER, remoteNode, sourceProduct, xmlResponse } from './fixtures/godomall';

const noGate: RateGate = { reserve: async () => {}, pause: async () => {} };
const secrets = { GODOMALL_PARTNER_KEY: 'private-partner', GODOMALL_CALLAMEDIA_API_USER_KEY: 'private-retail', GODOMALL_CALLAMEDIA1_API_USER_KEY: 'private-wholesale' };
test('strict XML roundtrip preserves Korean, HTML, entities, CDATA and repeated fields without coercing leading zeros', () => {
  const source = '<data><goods_data><cateCd>001001</cateCd><goodsNm><![CDATA[한글 & <b>제목</b>]]></goodsNm><optionData><sno>01</sno></optionData><optionData><sno>02</sno></optionData></goods_data></data>';
  const parsed = parseXml(source), goods = child(parsed, 'goods_data')!;
  assert.equal(value(goods, 'cateCd'), '001001'); assert.equal(value(goods, 'goodsNm'), '한글 & <b>제목</b>'); assert.equal(children(goods, 'optionData').length, 2);
  assert.deepEqual(parseXml(documentXml(goods)), parsed);
  const p = sourceProduct(), mapped = prepareInsert(p, 'retail', 'CA_marker', { ...defaultInsertCodes, brandCd: '001', scmNo: '1' });
  assert.equal(value(child(parseXml(mapped.xml), 'goods_data')!, 'goodsDescription'), p.automation.detailHtml);
  assert.equal(value(mapped.node, 'goodsNm'), p.name_own); assert.equal(value(mapped.node, 'goodsNmFl'), 'd');
  assert.equal(value(mapped.node, 'originNm'), 'Made in Korea');
  for (const field of ['goodsNmMain', 'goodsNmList', 'goodsNmDetail']) assert.equal(value(mapped.node, field), null);
});
test('registration uses only the basic name and preserves literal markup and entities in both malls', () => {
  const p = sourceProduct();
  for (const name of ['일반 상품명', '<b>상품 &amp; 테스트</b>', '<b></b>']) {
    p.name_own = name;
    for (const mall of ['retail', 'wholesale'] as const) {
      const mapped = prepareInsert(p, mall, 'CA_marker', { ...defaultInsertCodes, brandCd: '001', scmNo: '1' });
      const submitted = child(parseXml(mapped.xml), 'goods_data')!;
      assert.equal(value(submitted, 'goodsNmFl'), 'd'); assert.equal(value(submitted, 'goodsNm'), name);
      assert.equal(value(submitted, 'goodsDescription'), p.automation.detailHtml);
      for (const field of ['goodsNmMain', 'goodsNmList', 'goodsNmDetail']) {
        assert.equal(value(submitted, field), null); assert.ok(!(field in mapped.expected));
      }
    }
  }
  p.name_own = ' '.repeat(2);
  assert.throws(() => prepareInsert(p, 'retail', 'CA_marker', { ...defaultInsertCodes, brandCd: '001', scmNo: '1' }), /상품명/);
  p.name_own = `<b>${'가'.repeat(250)}</b>`;
  assert.throws(() => prepareInsert(p, 'retail', 'CA_marker', { ...defaultInsertCodes, brandCd: '001', scmNo: '1' }), /길이/);
});
test('wholesale regular price follows retail sales until a manual amount is enabled, including zero and blank', () => {
  const p = sourceProduct(), choices = { ...defaultInsertCodes, brandCd: '001', scmNo: '1' };
  assert.equal(value(prepareInsert(p, 'wholesale', 'CA_marker', choices).node, 'fixedPrice'), '1000');
  p.automation.wholesaleRegularPrice = { mode: 'manual', value: 900 };
  assert.equal(value(prepareInsert(p, 'wholesale', 'CA_marker', choices).node, 'fixedPrice'), '900');
  assert.equal(value(prepareInsert(p, 'retail', 'CA_marker', choices).node, 'fixedPrice'), '1500');
  p.automation.wholesaleRegularPrice.value = 0;
  assert.equal(value(prepareInsert(p, 'wholesale', 'CA_marker', choices).node, 'fixedPrice'), '0');
  p.automation.wholesaleRegularPrice.value = null;
  assert.equal(value(prepareInsert(p, 'wholesale', 'CA_marker', choices).node, 'fixedPrice'), null);
  p.automation.wholesaleRegularPrice = { mode: 'retail', value: 900 };
  p.price_retail = 0;
  assert.equal(value(prepareInsert(p, 'wholesale', 'CA_marker', choices).node, 'fixedPrice'), '0');
  p.price_retail = null;
  assert.equal(value(prepareInsert(p, 'wholesale', 'CA_marker', choices).node, 'fixedPrice'), null);
});
test('invalid XML, DTD/entity expansion, wrong response structure and non-official success code are rejected', () => {
  for (const xml of ['<a><b></a>', '<!DOCTYPE data [<!ENTITY x SYSTEM "file:///etc/passwd">]><data>&x;</data>', '<data><x></data>', '<data/><other/>']) assert.throws(() => parseXml(xml), GodomallError);
  for (const xml of ['<html>Bad gateway</html>', '<data><header><code>0</code></header><return/></data>']) assert.throws(() => responseData(parseXml(xml)), GodomallError);
  assert.equal(responseData(parseXml(xmlResponse())).code, '000');
});
test('shared partner and independent user secrets never cross malls; missing retail leaves wholesale usable', () => {
  assert.deepEqual(credentials(secrets, 'retail'), { partner_key: 'private-partner', key: 'private-retail' });
  assert.deepEqual(credentials(secrets, 'wholesale'), { partner_key: 'private-partner', key: 'private-wholesale' });
  const env = { ...secrets, GODOMALL_CALLAMEDIA_API_USER_KEY: '' };
  assert.throws(() => credentials(env, 'retail'), /GODOMALL_CALLAMEDIA_API_USER_KEY/);
  assert.equal(credentials(env, 'wholesale').key, 'private-wholesale');
});
test('transport uses the official HTTPS POST address, form authentication and the documented search parameters', async () => {
  let called = 0;
  const client = new GodomallClient(secrets, 'wholesale', (async (url, init) => {
    called++; assert.equal(url, 'https://openhub.godo.co.kr/godomall5/goods/Goods_Search.php'); assert.equal(init?.method, 'POST');
    const form = new URLSearchParams(String(init?.body)); assert.equal(form.get('partner_key'), 'private-partner'); assert.equal(form.get('key'), 'private-wholesale'); assert.equal(form.get('goodsNm'), '한글 & 상품');
    assert.ok(!String(url).includes('private-')); return new Response(xmlResponse([], '000', { total: 0, maxPage: 0, page: 4 }));
  }) as typeof fetch, noGate);
  assert.equal((await client.search({ goodsNm: '한글 & 상품', size: '100', page: '4' })).page.page, 4);
  await assert.rejects(client.search({ size: '101' }), /1–100/); assert.equal(called, 1);
});
test('pagination follows max_page beyond 100 records and does not fabricate missing values', async () => {
  const h = apiHarness(); for (let i = 1; i <= 205; i++) h.remote.retail.set(String(i), remoteNode(String(i)));
  let total = 0;
  for (let page = 1; page <= 3; page++) {
    const result = await h.request(`/godomall/retail/goods?page=${page}&size=100`); assert.equal(result.status, 200);
    const data = await result.json() as any; total += data.goods.length; assert.equal(data.hasNext, page < 3); assert.equal(data.total, 205);
  }
  assert.equal(total, 205);
  const minimal = await normalizeGoods('retail', xmlNode('goods_data', '', [xmlNode('goodsNo', '12')]));
  assert.equal(minimal.price, null); assert.equal(minimal.stock, null); assert.equal(minimal.display, null); assert.equal(minimal.image, null);
});
test('supplier codes retain the documented head office when Code_Search omits it', async () => {
  const supplier = (code: string, name: string) => xmlNode('scm_data', '', [xmlNode('scmNo', code), xmlNode('companyNm', name)]);
  for (const rows of [[], [supplier('2', '외부 공급사')], [supplier('1', '칼라 본사'), supplier('2', '외부 공급사')]]) {
    const client = new GodomallClient(secrets, 'retail', (async () => new Response(xmlResponse(rows))) as typeof fetch, noGate);
    const codes = await client.codes('scm');
    assert.equal(codes.filter(row => row.code === '1').length, 1);
    assert.equal(codes[0].name, rows.length === 2 ? '칼라 본사' : '본사');
    if (rows.length) assert.equal(codes.find(row => row.code === '2')?.name, '외부 공급사');
    await client.validateCode('scm', '1');
    await assert.rejects(client.validateCode('scm', '99'), (e: unknown) => e instanceof GodomallError && e.code === 'mall_code_invalid');
  }
});
test('the head office code never masks failed or unrecognized code responses', async () => {
  for (const [response, expected] of [
    [xmlResponse([], '999'), 'godomall_auth'],
    [xmlResponse([xmlNode('unexpected', 'data')]), 'xml_invalid'],
    [xmlResponse([xmlNode('scm_data', '', [xmlNode('scmNo', ''), xmlNode('companyNm', '누락')])]), 'xml_invalid'],
  ]) {
    const client = new GodomallClient(secrets, 'wholesale', (async () => new Response(response)) as typeof fetch, noGate);
    await assert.rejects(client.codes('scm'), (e: unknown) => e instanceof GodomallError && e.code === expected);
  }
  const client = new GodomallClient(secrets, 'wholesale', (async () => new Response(xmlResponse())) as typeof fetch, noGate);
  assert.deepEqual(await client.codes('delivery'), []);
});
test('same goodsNo in two malls remains distinct in search, cache and product links', async () => {
  const h = apiHarness(), retail = remoteNode(), wholesale = remoteNode(); setValue(wholesale, 'goodsNm', '도매 전용');
  h.remote.retail.set('1000000001', retail); h.remote.wholesale.set('1000000001', wholesale);
  const a = await (await h.request('/godomall/retail/goods')).json() as any, b = await (await h.request('/godomall/wholesale/goods')).json() as any;
  assert.notEqual(a.goods[0].name, b.goods[0].name); assert.match(a.goods[0].url, /callamedia\.kr/); assert.match(b.goods[0].url, /callamedia\.co\.kr/);
  assert.equal(h.tables.godomall_products.length, 2); assert.deepEqual(h.tables.godomall_products.map(r => r.mall_id).sort(), ['retail', 'wholesale']);
});
test('rate exhaustion preserves a successful response; 429 pauses and never retries a write', async () => {
  const pauses: number[] = []; const gate: RateGate = { ...noGate, pause: async (_, ms) => { pauses.push(ms); } };
  const good = new GodomallClient(secrets, 'retail', (async () => new Response(xmlResponse(), { headers: { 'ratelimit-available-level': 'EXHAUSTED', 'retry-after': '4' } })) as typeof fetch, gate);
  assert.equal((await good.call('insert', { data_url: 'https://example.test/payload.xml' })).code, '000'); assert.deepEqual(pauses, [4000]);
  let calls = 0;
  const throttled = new GodomallClient(secrets, 'retail', (async () => { calls++; return new Response('', { status: 429, headers: { 'retry-after': '7' } }); }) as typeof fetch, gate);
  await assert.rejects(throttled.call('insert'), (error: unknown) => error instanceof GodomallError && error.uncertain && error.retryAfter === 7); assert.equal(calls, 1); assert.equal(pauses[1], 7000);
});
test('upstream authentication, permission, validation, timeout and parsing errors are distinct and never echo keys', async () => {
  for (const [code, expected] of [['999', 'godomall_auth'], ['995', 'godomall_permission'], ['898', 'godomall_898']]) {
    const client = new GodomallClient(secrets, 'retail', (async () => new Response(xmlResponse([], code).replace('test fixture', 'private-partner private-retail'))) as typeof fetch, noGate);
    await assert.rejects(client.call('search'), (e: unknown) => e instanceof GodomallError && e.code === expected && !e.message.includes('private-'));
  }
  for (const [mode, code] of [['timeout', 'godomall_network'], ['xml', 'xml_invalid']]) {
    const client = new GodomallClient(secrets, 'retail', (async () => { if (mode === 'timeout') throw Error('private-retail'); return new Response('<bad>'); }) as typeof fetch, noGate);
    await assert.rejects(client.call('insert'), (e: unknown) => e instanceof GodomallError && e.code === code && e.uncertain && !e.message.includes('private-'));
  }
});
test('registration sends the original model and reports unsupported tier prices without blocking', () => {
  const p = sourceProduct(); p.price_wholesale_master = 700;
  const mapped = prepareInsert(p, 'wholesale', 'CA_marker', { ...defaultInsertCodes, scmNo: '1', brandCd: '001' }); assert.equal(value(mapped.node, 'goodsPrice'), '800'); assert.match(mapped.warnings[0], /700/);
  p.model = 'PF12+MK2';
  const originalModel = prepareInsert(p, 'retail', 'CA_marker', { ...defaultInsertCodes, scmNo: '1', brandCd: '001' });
  assert.equal(value(originalModel.node, 'goodsModelNo'), 'PF12+MK2'); assert.ok(originalModel.warnings.some(w => w.includes('모델번호')));
});
test('update merges latest values, retains repeated options and required information, forces imageUpdate=N', () => {
  const original = remoteNode(); setValue(original, 'optionFl', 'y'); setValue(original, 'ex_title', '항목1||항목2'); setValue(original, 'ex1', '기존 & 값'); setValue(original, 'ex2', '보존');
  for (const sno of ['11', '12']) original.children.push(xmlNode('optionData', '', Object.entries({ sno, optionNo: sno, optionValue1: `옵션${sno}`, optionPrice: '0', optionViewFl: 'y', optionSellFl: 'y', stockCnt: '3' }).map(([k, v]) => xmlNode(k, v))));
  const mapped = prepareUpdate(original, { goodsPrice: '2000', cateCd: '001002' });
  assert.equal(value(mapped.node, 'imageUpdate'), 'N'); assert.equal(value(mapped.node, 'goodsModelNo'), value(original, 'goodsModelNo')); assert.equal(value(mapped.node, 'ex1'), '기존 & 값'); assert.equal(children(mapped.node, 'optionData').length, 2); assert.equal(children(mapped.node, 'listImageData').length, 0);
  assert.equal(value(mapped.node, 'allCateCd'), '001001|001002');
  const actual = structuredClone(original); setValue(actual, 'goodsPrice', '2000'); setValue(actual, 'cateCd', '001002'); setValue(actual, 'allCateCd', '001001|001002');
  assert.deepEqual(mismatches(mapped.expected, actual), []);
  actual.children = actual.children.filter(n => n.name !== 'optionData'); assert.ok(mismatches(mapped.expected, actual).includes('__preserve_optionData'));
});
test('incomplete optional sources warn in the review without blocking edits', () => {
  const node = remoteNode(); node.children = node.children.filter(n => n.name !== 'ex_title');
  assert.ok(preservationIssues(node).some(issue => issue.includes('ex_title')));
  const mapped = prepareUpdate(node, { goodsPrice: '2' }); assert.equal(value(mapped.node, 'goodsPrice'), '2'); assert.ok(mapped.warnings.some(w => w.includes('기존 추가정보를 제거')));
  const options = remoteNode(); setValue(options, 'optionFl', 'y'); options.children.push(xmlNode('optionData', '', [xmlNode('stockCnt', '1')]));
  const optionEdit = prepareUpdate(options, { goodsPrice: '2' }); assert.equal(value(optionEdit.node, 'goodsPrice'), '2'); assert.ok(optionEdit.warnings.some(w => w.includes('고유번호')));
});
test('name edits use literal basic names and retain existing remote extended names', () => {
  const original = remoteNode(), name = '<b>새 상품명 & 한글</b>';
  setValue(original, 'goodsNmFl', 'e');
  for (const field of ['goodsNmMain', 'goodsNmList', 'goodsNmDetail']) setValue(original, field, `${field} 기존값`);
  const mapped = prepareUpdate(original, { goodsNm: name });
  assert.equal(value(mapped.node, 'goodsNm'), name); assert.equal(value(mapped.node, 'goodsNmFl'), 'd');
  for (const field of ['goodsNmMain', 'goodsNmList', 'goodsNmDetail']) {
    assert.equal(value(mapped.node, field), `${field} 기존값`); assert.ok(!mapped.changes.some(change => change.field === field));
  }
  const plain = prepareUpdate(mapped.node,{goodsNm:'일반 상품명'}); assert.equal(value(plain.node,'goodsNmFl'),'d'); assert.equal(value(plain.node,'goodsNm'),'일반 상품명');
  const priceOnly = prepareUpdate(original, { goodsPrice: '2000' });
  assert.equal(value(priceOnly.node, 'goodsNmFl'), 'e'); assert.equal(value(priceOnly.node, 'goodsNm'), value(original, 'goodsNm'));
});
test('live goodsMustInfo aliases preserve explicit empty and nested required information', () => {
  const original = remoteNode(); original.children = original.children.filter(n => !['ex_title', 'goodsMustInfoData'].includes(n.name));
  setValue(original, 'goodsMustInfo', '');
  let mapped = prepareUpdate(original, { goodsPrice: '2000' });
  assert.ok(child(mapped.node, 'goodsMustInfoData')); assert.ok(!mapped.warnings.some(w => w.includes('상품필수정보')));
  const actual = structuredClone(original); setValue(actual, 'goodsPrice', '2000');
  assert.deepEqual(mismatches(mapped.expected, actual), []);
  setValue(original, 'goodsMustInfo', JSON.stringify([[{ title: '제조국', value: '대한민국 & 원문' }]]));
  mapped = prepareUpdate(original, { goodsPrice: '2000' });
  assert.match(mapped.xml, /<infoTitle>제조국<\/infoTitle><infoValue>대한민국 &amp; 원문<\/infoValue>/);
  setValue(actual, 'goodsMustInfo', value(original, 'goodsMustInfo')!);
  assert.deepEqual(mismatches(mapped.expected, actual), []);
  setValue(actual, 'goodsMustInfo', ''); assert.ok(mismatches(mapped.expected, actual).includes('__preserve_goodsMustInfoData'));
});
test('unreadable required information remains a visible warning and is not invented', () => {
  const original = remoteNode(); original.children = original.children.filter(n => n.name !== 'goodsMustInfoData');
  setValue(original, 'goodsMustInfo', 'unexpected-source');
  const mapped = prepareUpdate(original, { goodsPrice: '2000' });
  assert.equal(child(mapped.node, 'goodsMustInfoData'), undefined); assert.ok(mapped.warnings.some(w => w.includes('상품필수정보')));
});

async function prepare(h: ReturnType<typeof apiHarness>, kind = 'insert', mall = 'retail', extra: Record<string, unknown> = {}) {
  const result = await h.request(`/godomall/${mall}/operations/prepare`, 'POST', { kind, itemId: API_ITEM, choices: { ...defaultInsertCodes, brandCd: '001', scmNo: '1' }, ...extra });
  const body = await result.json() as any; assert.equal(result.status, 201, JSON.stringify(body)); return body.operation;
}
async function run(h: ReturnType<typeof apiHarness>, op: any) {
  const result = await h.request(`/godomall/${op.mall_id}/operations/${op.id}/execute`, 'POST', { confirmed: true }); const body = await result.json() as any; assert.equal(result.status, 200, JSON.stringify(body)); return body.operation;
}
test('insert requires confirmation, fetches expiring XML, re-reads actual fields, persists identity and is never resubmitted', async () => {
  const h = apiHarness(), op = await prepare(h);
  assert.equal(h.calls.filter(c => c.endpoint === 'Goods_Insert.php').length, 0);
  assert.equal((await h.request(`/godomall/retail/operations/${op.id}/execute`, 'POST', {})).status, 422);
  const result = await run(h, op); assert.equal(result.state, 'success'); assert.equal(result.goods_no, '1000000001'); assert.ok(result.checked_at); assert.equal(result.verification_attempts, 1);
  const saved = h.remote.retail.get(result.goods_no)!;
  assert.equal(value(saved, 'goodsNmFl'), 'd'); assert.equal(value(saved, 'goodsNm'), h.tables.product_items[0].name_own);
  for (const field of ['goodsNmMain', 'goodsNmList', 'goodsNmDetail']) assert.equal(value(saved, field), null);
  await run(h, op); assert.equal(h.calls.filter(c => c.endpoint === 'Goods_Insert.php').length, 1);
  const call = h.calls.find(c => c.endpoint === 'Goods_Insert.php')!; assert.match(call.params.get('data_url')!, /^https:\/\/calla.test\/api\/godomall\/payloads\//); assert.ok(!call.params.get('data_url')!.includes('private'));
  assert.equal((await h.worker.fetch(new Request(call.params.get('data_url')!), h.env)).status, 404);
});
test('lost insert acknowledgement recovers by unique goodsCd without duplicate creation', async () => {
  const h = apiHarness(); h.modes.insert = 'timeout-after-create'; const op = await prepare(h), result = await run(h, op);
  assert.equal(result.state, 'success'); assert.equal(h.remote.retail.size, 1); assert.equal(h.calls.filter(c => c.endpoint === 'Goods_Insert.php').length, 1);
  assert.ok(h.calls.some(c => c.endpoint === 'Goods_Search.php' && c.params.get('goodsCd') === op.marker));
});
test('missing response identifier still requires exact unique marker; a successful request alone is not success', async () => {
  const h = apiHarness(); h.modes.insert = 'no-identifier'; const op = await prepare(h); h.modes.failSearch = true;
  const result = await run(h, op); assert.equal(result.state, 'needs_review'); assert.equal(result.checked_at, null); assert.equal(h.calls.filter(c => c.endpoint === 'Goods_Insert.php').length, 1);
  await run(h, op); assert.equal(h.calls.filter(c => c.endpoint === 'Goods_Insert.php').length, 1);
  h.modes.failSearch = false;
  const confirmed = await (await h.request(`/godomall/retail/operations/${op.id}/verify`, 'POST', {})).json() as any; assert.equal(confirmed.operation.state, 'success');
});
test('preview rejects a foreign mall, another administrator, viewer, expired review and changed local source', async () => {
  const h = apiHarness(), op = await prepare(h);
  assert.equal((await h.request(`/godomall/wholesale/operations/${op.id}`)).status, 404);
  assert.equal((await h.request(`/godomall/retail/operations/${op.id}/execute`, 'POST', { confirmed: true }, '44444444-4444-4444-8444-444444444444')).status, 403);
  h.modes.role = 'viewer'; assert.equal((await h.request('/godomall/retail/operations/prepare', 'POST', { kind: 'insert' })).status, 403); h.modes.role = 'admin';
  h.tables.product_items[0].updated_at = new Date().toISOString(); assert.equal((await h.request(`/godomall/retail/operations/${op.id}/execute`, 'POST', { confirmed: true })).status, 409);
  h.tables.godomall_operations[0].expires_at = '2020-01-01T00:00:00Z'; assert.equal((await h.request(`/godomall/retail/operations/${op.id}/execute`, 'POST', { confirmed: true })).status, 409);
  assert.equal(h.calls.filter(c => c.endpoint === 'Goods_Insert.php').length, 0);
});
test('mutation preview uses fresh remote state and execution rejects concurrent remote edits', async () => {
  const h = apiHarness(), node = remoteNode(); h.remote.retail.set('1000000001', node);
  const remote = await normalizeGoods('retail', node), op = await prepare(h, 'update', 'retail', { goodsNo: remote.goodsNo, fingerprint: remote.fingerprint, changes: { goodsPrice: '2000' } });
  setValue(node, 'goodsPrice', '3000');
  assert.equal((await h.request(`/godomall/retail/operations/${op.id}/execute`, 'POST', { confirmed: true })).status, 409); assert.equal(h.calls.filter(c => c.endpoint === 'Goods_Update.php').length, 0);
});
test('update re-verifies preserved data, not only the edited field', async () => {
  const h = apiHarness(), node = remoteNode(); h.remote.retail.set('1000000001', node); h.modes.update = 'lose-options';
  const remote = await normalizeGoods('retail', node), op = await prepare(h, 'update', 'retail', { goodsNo: remote.goodsNo, fingerprint: remote.fingerprint, changes: { goodsPrice: '2000' } });
  const result = await run(h, op); assert.equal(result.state, 'needs_review'); assert.match(result.error_message, /goodsMustInfoData/);
});
test('live missing optional fields can proceed through update and result verification', async () => {
  const h = apiHarness(), node = remoteNode(); node.children = node.children.filter(n => !['ex_title','goodsMustInfoData'].includes(n.name)); setValue(node,'goodsMustInfo','');
  h.remote.retail.set('1000000001',node);
  const remote = await normalizeGoods('retail',node), op = await prepare(h,'update','retail',{goodsNo:remote.goodsNo,fingerprint:remote.fingerprint,changes:{goodsPrice:'2000'}});
  const result = await run(h,op); assert.equal(result.state,'success'); assert.equal(value(h.remote.retail.get(remote.goodsNo)!,'goodsPrice'),'2000');
});
test('new and previously prepared deletion requests are rejected before any upstream request', async () => {
  const h = apiHarness();
  const denied = await h.request('/godomall/retail/operations/prepare','POST',{kind:'delete',goodsNo:'1000000001'});
  assert.equal(denied.status,403); assert.equal(h.tables.godomall_operations.length,0);
  const op = await prepare(h); h.tables.godomall_operations[0].kind='delete';
  const old = await h.request(`/godomall/retail/operations/${op.id}/execute`,'POST',{confirmed:true});
  assert.equal(old.status,403); assert.equal(h.calls.filter(c=>c.endpoint==='Goods_Delete.php').length,0);
  await assert.rejects(new GodomallClient(secrets,'retail', (()=>{throw Error('must not fetch')}) as typeof fetch,noGate).call('delete',{goodsNo:'1000000001'}),/고도몰 관리자/);
});
test('public history omits payloads and capability hashes; payload route requires exact live capability', async () => {
  const h = apiHarness(), op = await prepare(h);
  const res = await h.request('/godomall/retail/operations'); const text = await res.text();
  for (const forbidden of ['payload_xml', 'payload_token_hash', 'created_by', 'expected', 'service-private', 'partner-private']) assert.ok(!text.includes(forbidden), forbidden);
  assert.equal((await h.worker.fetch(new Request(`https://calla.test/api/godomall/payloads/${op.id}/${'0'.repeat(64)}.xml`), h.env)).status, 404);
});
test('legacy runner cannot release or overwrite an unresolved API registration', async () => {
  const h = apiHarness(); h.tables.godomall_operations.push({ id: crypto.randomUUID(), item_id: API_ITEM, mall_id: 'retail', state: 'needs_review' });
  const res = await h.request('/runner/registrations', 'POST', { itemId: API_ITEM, channel: 'retail', status: 'running' }); assert.equal(res.status, 409);
});
test('a missing mall secret is explicit and the other mall can still search', async () => {
  const h = apiHarness(); h.env.GODOMALL_CALLAMEDIA_API_USER_KEY = '';
  const connections = await (await h.request('/godomall/connections')).json() as any;
  assert.equal(connections.connections[0].configured, false); assert.equal(connections.connections[1].configured, true);
  assert.equal((await h.request('/godomall/retail/goods')).status, 503); assert.equal((await h.request('/godomall/wholesale/goods')).status, 200);
});
