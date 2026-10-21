import test from 'node:test';
import assert from 'node:assert/strict';
import { mismatches, prepareInsert } from '../server/godomall-mapping';
import { setValue, xmlNode } from '../server/godomall-xml';
import { apiHarness, API_ITEM, defaultInsertCodes, sourceProduct } from './fixtures/godomall';

test('insert verification accepts the observed Godomall ancestor expansion without changing the requested primary category', () => {
  const product = sourceProduct(); product.automation.categoryCodes.retail = '017007';
  const prepared = prepareInsert(product, 'retail', 'CA_original_operation', { ...defaultInsertCodes, brandCd: '001', scmNo: '1' });
  const actual = structuredClone(prepared.node);
  for (const image of actual.children.filter(n => n.name.endsWith('ImageData'))) image.text = `https://mall.test/goods/1000000001/${image.name}.jpg`;
  setValue(actual, 'allCateCd', '017|017007');
  assert.equal((prepared.expected as Record<string, string>).allCateCd, '017007');
  assert.deepEqual(mismatches(prepared.expected, actual), []);
  setValue(actual, 'cateCd', '017');
  assert.notEqual(mismatches(prepared.expected, actual).length, 0);
});

test('connected categories tolerate only ordering, duplicates and ancestors of every explicitly requested category', () => {
  const compare = (wanted: string, actual: string) => mismatches({ allCateCd: wanted }, xmlNode('goods_data', '', [xmlNode('allCateCd', actual)]));
  for (const [wanted, actual] of [
    ['017007', '017007|017'],
    ['017007', '017|017007|017007'],
    ['017007001002', '017|017007|017007001|017007001002'],
    ['017007|018001', '018001|018|017|017007'],
    ['', ''],
  ]) assert.deepEqual(compare(wanted, actual), [], `${wanted} -> ${actual}`);
  for (const actual of ['017', '017008', '017|017008', '017|017007|018', '017|017007|017008', '017|017007001', '017|017007|x', '17|017007', '017||017007', '017,017007', '']) {
    assert.deepEqual(compare('017007', actual), ['allCateCd'], actual);
  }
  assert.deepEqual(compare('017007|018001', '017|017007|018'), ['allCateCd']);
  assert.deepEqual(mismatches({ allCateCd: '017007' }, xmlNode('goods_data')), ['allCateCd']);
});

test('an already saved operation reconciles expanded categories with the same unique marker and no repeated insert', async () => {
  const h = apiHarness();
  const prepared = await h.request('/godomall/retail/operations/prepare', 'POST', {
    kind: 'insert', itemId: API_ITEM, choices: { ...defaultInsertCodes, brandCd: '001', scmNo: '1' },
  });
  assert.equal(prepared.status, 201);
  const { operation } = await prepared.json() as any;
  h.modes.insert = 'no-identifier';
  const submitted = await h.request(`/godomall/retail/operations/${operation.id}/execute`, 'POST', { confirmed: true });
  const result = await submitted.json() as any;
  assert.equal(result.operation.state, 'success');
  const saved = h.remote.retail.get(result.operation.goods_no)!;
  setValue(saved, 'allCateCd', '001|001001');
  // Reproduce a persisted operation awaiting verification from the older comparator.
  Object.assign(h.tables.godomall_operations[0], { state: 'needs_review', goods_no: null, checked_at: null, error_message: 'allCateCd' });
  const response = await h.request(`/godomall/retail/operations/${operation.id}/verify`, 'POST', {});
  assert.equal(response.status, 200);
  const verified = await response.json() as any;
  assert.equal(verified.operation.state, 'success');
  assert.equal(verified.operation.goods_no, result.operation.goods_no);
  assert.equal(h.calls.filter(call => call.endpoint === 'Goods_Insert.php').length, 1);
  assert.equal(h.remote.retail.size, 1);
  assert.ok(h.calls.some(call => call.endpoint === 'Goods_Search.php' && call.params.get('goodsCd') === operation.marker));
});
