import test from 'node:test';
import assert from 'node:assert/strict';
import { child, parseXml, setValue, value, xmlNode } from '../server/godomall-xml';
import { apiHarness, API_ITEM, remoteNode } from './fixtures/godomall';

test('registration resolves each mall\'s shipping and guide defaults and ignores client overrides', async () => {
  for (const mall of ['retail', 'wholesale'] as const) {
    const h = apiHarness();
    const response = await h.request(`/godomall/${mall}/operations/prepare`, 'POST', {
      kind: 'insert', itemId: API_ITEM,
      choices: { brandCd: '001', scmNo: '1', deliverySno: '999', detailInfoDelivery: '0', detailInfoAS: '0', detailInfoRefund: '0' },
    });
    assert.equal(response.status, 201, await response.text());
    const expected = mall === 'retail'
      ? { deliverySno: '1', detailInfoDelivery: '002001', detailInfoAS: '003001', detailInfoRefund: '004001' }
      : { deliverySno: '10', detailInfoDelivery: '002091', detailInfoAS: '003091', detailInfoRefund: '004091' };
    const operation = h.tables.godomall_operations[0], submitted = child(parseXml(operation.payload_xml), 'goods_data')!;
    for (const [field, code] of Object.entries(expected)) {
      assert.equal(value(submitted, field), code, `${mall} ${field}`);
      assert.equal(operation.expected[field], code, `${field} must be re-read during verification`);
      assert.ok(operation.changes.some((change: any) => change.field === field && change.after === code));
    }
    assert.equal(value(submitted, 'detailInfoExchange'), '0');
    assert.ok(h.calls.every(call => call.mall === mall));
    assert.equal(h.calls.filter(call => call.endpoint === 'Goods_Insert.php').length, 0);
  }
});

test('registration accepts omitted shipping choices and resolves named defaults instead of the first code', async () => {
  const h = apiHarness();
  h.codeRows.retail.delivery.unshift(xmlNode('code_data', '', [xmlNode('sno', '88'), xmlNode('method', '다른 배송조건')]));
  setValue(h.codeRows.retail.delivery[1], 'sno', '37');
  setValue(h.codeRows.retail.asInfo[0], 'informCd', '003078');
  setValue(h.codeRows.retail.asInfo[0], 'informNm', '  AS안내   - 기본  ');
  const response = await h.request('/godomall/retail/operations/prepare', 'POST', { kind: 'insert', itemId: API_ITEM, choices: { brandCd: '001', scmNo: '1' } });
  assert.equal(response.status, 201, await response.text());
  assert.equal(h.tables.godomall_operations[0].expected.deliverySno, '37');
  assert.equal(h.tables.godomall_operations[0].expected.detailInfoAS, '003078');
});

test('missing, duplicate and disabled defaults stop preparation without a fallback or remote write', async () => {
  for (const mall of ['retail', 'wholesale'] as const) for (const kind of ['delivery', 'deliveryInfo', 'asInfo', 'refundInfo']) {
    for (const failure of ['missing', 'duplicate', 'disabled']) {
      const h = apiHarness(), rows = h.codeRows[mall][kind];
      if (failure === 'missing') rows.length = 0;
      if (failure === 'duplicate') rows.push(structuredClone(rows[0]));
      if (failure === 'disabled') setValue(rows[0], kind === 'delivery' ? 'sno' : 'informCd', '0');
      const response = await h.request(`/godomall/${mall}/operations/prepare`, 'POST', { kind: 'insert', itemId: API_ITEM, choices: { brandCd: '001', scmNo: '1', deliverySno: '1' } });
      const body = await response.json() as any;
      assert.equal(response.status, 422, `${mall} ${kind} ${failure}: ${JSON.stringify(body)}`);
      assert.equal(body.error.code, 'registration_default_unavailable');
      assert.equal(h.tables.godomall_operations.length, 0);
      assert.equal(h.calls.filter(call => call.endpoint === 'Goods_Insert.php').length, 0);
    }
  }
});

test('editing an existing product preserves its shipping and guides without applying registration defaults', async () => {
  const h = apiHarness(), node = remoteNode();
  const preserved = { deliverySno: '87', detailInfoDelivery: '002088', detailInfoAS: '0', detailInfoRefund: '004055' };
  for (const [field, code] of Object.entries(preserved)) setValue(node, field, code);
  h.remote.retail.set('1000000001', node);
  for (const kind of Object.keys(h.codeRows.retail)) h.codeRows.retail[kind] = [];
  const detail = await (await h.request('/godomall/retail/goods/1000000001')).json() as any;
  const response = await h.request('/godomall/retail/operations/prepare', 'POST', { kind: 'update', goodsNo: '1000000001', fingerprint: detail.goods.fingerprint, changes: { goodsPrice: '1234' } });
  assert.equal(response.status, 201, await response.text());
  const operation = h.tables.godomall_operations[0], submitted = child(parseXml(operation.payload_xml), 'goods_data')!;
  for (const [field, code] of Object.entries(preserved)) assert.equal(value(submitted, field), code);
  assert.equal(h.calls.filter(call => call.endpoint === 'Code_Search.php').length, 0);
});
