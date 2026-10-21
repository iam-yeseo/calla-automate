import test from 'node:test';
import assert from 'node:assert/strict';
import type { GodomallOperation, ProductRegistrationPreview } from '../src/godomall-types';
import { registrationPreview } from '../server/godomall-preview';
import { resolveShippingPolicy } from '../src/registration-delivery';
import { child, parseXml, value } from '../server/godomall-xml';
import { apiHarness, API_ITEM } from './fixtures/godomall';

const prepare = async (h: ReturnType<typeof apiHarness>, mall: 'retail' | 'wholesale' = 'retail') => {
  const response = await h.request(`/godomall/${mall}/operations/prepare`, 'POST', { kind: 'insert', itemId: API_ITEM, choices: { brandCd: '001', scmNo: '1' } });
  assert.equal(response.status, 201);
  return (await response.json() as { operation: GodomallOperation }).operation;
};
const preview = (op: GodomallOperation): ProductRegistrationPreview => { assert.ok(op.product_preview); return op.product_preview; };

test('prepared registration previews use the actual independent mall payload and verified code names', async () => {
  for (const mall of ['retail', 'wholesale'] as const) {
    const h = apiHarness();
    const p = h.tables.product_items[0];
    p.brand = 'Actual manufacturer';
    p.name_own = '<font color="#EF4036">[중고상품]</font> 등록 상품 & 본문';
    p.automation.detailHtml = '<div>Actual detail <img src="https://example.test/detail.png"><script>window.previewSentinel = true</script></div>';
    const op = await prepare(h, mall), saved = h.tables.godomall_operations[0];
    const actual = child(parseXml(saved.payload_xml), 'goods_data')!;
    const shown = preview(op);
    assert.equal(shown.name, value(actual, 'goodsNm'));
    assert.equal(shown.thumbnailUrl, value(actual, 'listImageData'));
    assert.deepEqual(shown.brand, { code: '001', name: 'CALLA' });
    assert.deepEqual(shown.category, { code: mall === 'retail' ? '001001' : '002001', name: 'CALLA', path: ['CALLA'] });
    assert.equal(shown.price, Number(value(actual, 'goodsPrice')));
    assert.equal(shown.regularPrice, Number(value(actual, 'fixedPrice')));
    assert.equal(shown.manufacturer, 'Actual manufacturer');
    assert.equal(shown.origin, value(actual, 'originNm'));
    assert.equal(shown.detailHtml, value(actual, 'goodsDescription'));
    assert.equal(shown.detailHtmlMobile, value(actual, 'goodsDescriptionMobile'));
    assert.equal(shown.shipping.code, mall === 'retail' ? '1' : '10');
    assert.equal(shown.shipping.name, mall === 'retail' ? '배송방법' : '칼라배송');
    assert.equal(shown.shipping.fee, 4000); assert.equal(shown.shipping.freeAbove, 100000);
    assert.equal(shown.shipping.policySource, 'prepared-snapshot');
    assert.equal(shown.shipping.checkedAt, '2026-10-15T04:06:48.000Z');
    assert.ok(shown.shipping.sourceUrl?.includes(mall === 'retail' ? 'gdadmin.callamedia.kr/' : 'gdadmin.callamedia1.godomall.com/'));
    assert.equal(shown.shipping.methods?.length, mall === 'retail' ? 3 : 2);
    assert.match(shown.shipping.description, /상품 1개/);
    assert.deepEqual(shown.display, { pc: 'n', mobile: 'n' });
    assert.deepEqual(shown.sell, { pc: 'y', mobile: 'y' });
    assert.ok(!saved.payload_xml.includes('<display>'));
    assert.ok(!Object.keys(saved.expected).some(key => key.includes('preview') || key.includes('display')));
    for (const secret of ['payload_xml', 'payload_token_hash', 'expected', 'created_by']) assert.ok(!(secret in op));
    assert.equal(h.calls.filter(call => call.endpoint === 'Goods_Insert.php').length, 0);
  }
});

test('saved registration preview remains immutable after product edits and through result-review reads', async () => {
  const h = apiHarness(), op = await prepare(h), initial = preview(op);
  Object.assign(h.tables.product_items[0], { name_own: 'Later editor name', price_retail: 900000, image_url: 'https://example.test/later.jpg', brand: 'Later manufacturer' });
  h.tables.product_items[0].automation.detailHtml = '<p>Later details</p>';
  h.tables.godomall_operations[0].state = 'needs_review';
  const upstreamBefore = h.calls.length;
  const detail = await h.request(`/godomall/retail/operations/${op.id}`);
  assert.equal(detail.status, 200);
  const reloaded = (await detail.json() as { operation: GodomallOperation }).operation;
  assert.deepEqual(preview(reloaded), initial);
  assert.equal(reloaded.state, 'needs_review');
  assert.equal(h.calls.length, upstreamBefore, 'reviewing a stored preview makes no live mall requests');
  const history = await h.request('/godomall/retail/operations');
  const listed = (await history.json() as { operations: GodomallOperation[] }).operations[0];
  assert.equal(listed.product_preview, undefined, 'history avoids duplicating full PC/mobile HTML');
  assert.equal(h.calls.filter(call => call.endpoint === 'Goods_Insert.php').length, 0);
});

test('legacy operations render actual expected values with changes fallback and never infer shipping fees', () => {
  const changes: GodomallOperation['changes'] = [
    { field: 'goodsNm', label: '상품명', before: null, after: 'Legacy 상품' },
    { field: 'goodsPrice', label: '판매가', before: null, after: '0' },
    { field: 'brandCd', label: '브랜드', before: null, after: '001', display: { name: 'Stale brand' } },
    { field: 'cateCd', label: '카테고리', before: null, after: '001001' },
    { field: 'deliverySno', label: '배송비 코드', before: null, after: '1' },
    { field: 'goodsDescription', label: 'PC 상세설명', before: null, after: '<p>PC HTML</p>' },
    { field: 'goodsDescriptionMobile', label: '모바일 상세설명', before: null, after: '<p>Mobile HTML</p>' },
  ];
  const shown = registrationPreview({ title: 'Fallback title', expected: { goodsNm: 'Saved expected name', brandCd: '002', fixedPrice: '', goodsDescriptionMobile: '' }, changes });
  assert.equal(shown.name, 'Saved expected name');
  assert.equal(shown.price, 0);
  assert.equal(shown.regularPrice, null);
  assert.deepEqual(shown.brand, { code: '002', name: null }, 'a label for another code must not leak into preview');
  assert.deepEqual(shown.category, { code: '001001', name: null, path: [] });
  assert.equal(shown.shipping.name, null);
  assert.equal(shown.shipping.fee, null);
  assert.equal(shown.shipping.freeAbove, null);
  assert.equal(shown.detailHtml, '<p>PC HTML</p>');
  assert.equal(shown.detailHtmlMobile, '', 'an explicitly blank saved value wins over changes fallback');
  const changesOnly = registrationPreview({ title: 'Fallback title', changes });
  assert.equal(changesOnly.name, 'Legacy 상품');
  assert.equal(changesOnly.detailHtmlMobile, '<p>Mobile HTML</p>');
  const missing = registrationPreview({ title: 'Old title', changes: [] });
  assert.equal(missing.name, 'Old title'); assert.equal(missing.price, null); assert.equal(missing.thumbnailUrl, null);
});

test('verified shipping policies distinguish the free threshold, method exceptions and regional fees', () => {
  for (const [mall, code, name] of [['retail', '1', '배송방법'], ['wholesale', '10', '칼라배송']] as const) {
    assert.equal(resolveShippingPolicy(mall, code, name, 99999)?.fee, 4000);
    assert.equal(resolveShippingPolicy(mall, code, name, 100000)?.fee, 0);
    assert.equal(resolveShippingPolicy(mall, code, name, 100001)?.fee, 0);
    assert.equal(resolveShippingPolicy(mall, code, name, null)?.fee, null);
    assert.equal(resolveShippingPolicy(mall, code, name, 0)?.policySource, 'current-policy');
    assert.equal(resolveShippingPolicy(mall, code, 'Other name', 0), null);
    assert.equal(resolveShippingPolicy(mall, '999', name, 0), null);
  }
  assert.equal(resolveShippingPolicy('retail', '10', '칼라배송', 100000), null);
  assert.equal(resolveShippingPolicy('wholesale', '1', '배송방법', 100000), null);
  assert.equal(resolveShippingPolicy('retail', '1', null, 100000), null);
  const retail = resolveShippingPolicy('retail', '1', '배송방법', 100000)!;
  assert.equal(retail.methods?.find(method => method.code === 'visit')?.fee, 0);
  assert.match(retail.additionalFeeNote!, /3,300원/);
  const wholesale = resolveShippingPolicy('wholesale', '10', '칼라배송', 100000)!;
  const direct = wholesale.methods?.find(method => method.code === 'etc');
  assert.equal(direct?.fee, 4000); assert.equal(direct?.freeAbove, null);
  assert.match(direct!.description, /구매금액과 관계없이/);
  assert.match(wholesale.additionalFeeNote!, /4,000원/);
  assert.match(wholesale.additionalFeeNote!, /중복.*확인되지/);
});

test('a shipping snapshot cannot be borrowed across malls, codes, or setting names', () => {
  const policy = resolveShippingPolicy('retail', '1', '배송방법', 100000)!;
  const changes: GodomallOperation['changes'] = [{ field: 'deliverySno', label: '배송비', before: null, after: '1', display: { name: '배송방법', shipping: { ...policy, policySource: 'prepared-snapshot' } } }];
  const valid = registrationPreview({ title: '상품', mall_id: 'retail', changes });
  assert.equal(valid.shipping.fee, 0);
  const wrongMall = registrationPreview({ title: '상품', mall_id: 'wholesale', changes });
  assert.equal(wrongMall.shipping.fee, null);
  const wrongCode = registrationPreview({ title: '상품', mall_id: 'retail', expected: { deliverySno: '10' }, changes });
  assert.equal(wrongCode.shipping.fee, null);
  changes[0].display!.name = 'New settings name';
  assert.equal(registrationPreview({ title: '상품', mall_id: 'retail', changes }).shipping.fee, null);
});
