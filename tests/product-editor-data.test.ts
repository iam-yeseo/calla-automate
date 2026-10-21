import test from 'node:test';
import assert from 'node:assert/strict';
import { core, duplicateProduct, prepareDraft } from '../src/domain';
import { prepareInsert } from '../server/godomall-mapping';
import { child, parseXml, value } from '../server/godomall-xml';
import { apiHarness, API_ITEM, defaultInsertCodes, sourceProduct } from './fixtures/godomall';

test('legacy name prefixes split only unambiguous leading styled text', () => {
  for (const source of ['<font color="#EF4036">[중고상품]</font> P12', '<span style="color: red;">[중고상품]</span>P12']) {
    assert.deepEqual(core.namePrefix(source), { enabled: true, text: '[중고상품]', name: 'P12' });
  }
  for (const source of ['<font color="#EF4036">P12 전체 상품명</font>', '<font color="red"><b>[중고]</b></font> P12', '<span class="notice">[중고]</span> P12', '<font color="red" onclick="alert(1)">[중고]</font> P12', '보통 상품명']) {
    assert.deepEqual(core.namePrefix(source), { enabled: false, text: '', name: source });
  }
  const result = core.withNamePrefix('P12 <b>원문</b>', { enabled: true, text: '[중고 & <특가>]' });
  assert.equal(result, '<font color="#EF4036">[중고 &amp; &lt;특가&gt;]</font> P12 <b>원문</b>');
  assert.deepEqual(core.namePrefix(result), { enabled: true, text: '[중고 & <특가>]', name: 'P12 <b>원문</b>' });
  assert.equal(core.withNamePrefix('P12', { enabled: false, text: '[중고]' }), 'P12');
});

test('legacy prefix entities decode once or preserve the complete original name', () => {
  const wrap = (text: string) => `<font color="#EF4036">${text}</font> P12`;
  for (const entity of ['&trade;', '&copy;', '&NotEqualTilde;', '&constructor;', '&#x110000;', '&#1114112;', '&#0;', '&#xD800;', '&#55296;', '&#xZZ;', '&#12AB;', '&#;', '&trade', '&#X1F525']) {
    const source = wrap(`[${entity}]`);
    assert.deepEqual(core.namePrefix(source), { enabled: false, text: '', name: source }, entity);
    assert.equal(core.withNamePrefix(core.namePrefix(source).name, core.namePrefix(source)), source, entity);
  }
  for (const entity of ['&#X1F525;', '&#x1f525;', '&#128293;']) {
    const parsed = core.namePrefix(wrap(`[${entity}]`));
    assert.deepEqual(parsed, { enabled: true, text: '[🔥]', name: 'P12' });
    assert.equal(core.withNamePrefix(parsed.name, parsed), wrap('[🔥]'));
  }
  for (const text of ['[&amp;trade;]', '[&amp;#X1F525;]', '[&amp;amp;]', '[&lt;특가&gt; &amp; 한정]']) {
    const source = wrap(text), parsed = core.namePrefix(source);
    assert.equal(parsed.enabled, true);
    assert.equal(core.withNamePrefix(parsed.name, parsed), source);
  }
});

test('ordered category selections survive save and copy, with legacy primary edits retaining additions', () => {
  const product = sourceProduct();
  product.automation.categorySelections = { retail: ['001001', '003001', '004001'], wholesale: ['002001', '005001'] };
  for (const automation of [core.normalize(product.automation), prepareDraft([product])[0].automation, duplicateProduct(product).automation]) {
    assert.deepEqual((automation as typeof product.automation).categorySelections, product.automation.categorySelections);
  }
  const legacy = core.normalize({ categoryCodes: { retail: '001001', wholesale: '002001' } });
  assert.deepEqual(legacy.categorySelections, { retail: ['001001'], wholesale: ['002001'] });
  product.automation.categoryCodes.retail = '006001';
  assert.deepEqual(core.normalize(product.automation).categorySelections?.retail, ['006001', '003001', '004001']);
});

test('insert sends first category as representative, every additional category, and head office regardless of client choice', () => {
  const product = sourceProduct();
  product.automation.categorySelections = { retail: ['001001', '003001', '004001'], wholesale: ['002001', '005001'] };
  for (const mall of ['retail', 'wholesale'] as const) {
    const mapped = prepareInsert(product, mall, 'CA_categories', { ...defaultInsertCodes, brandCd: '001', scmNo: '99' });
    assert.equal(value(mapped.node, 'cateCd'), product.automation.categorySelections[mall][0]);
    assert.equal(value(mapped.node, 'allCateCd'), product.automation.categorySelections[mall].join('|'));
    assert.equal(value(mapped.node, 'scmNo'), '1');
    assert.equal(mapped.expected.allCateCd, product.automation.categorySelections[mall].join('|'));
    assert.ok(mapped.changes.some(change => change.field === 'allCateCd'));
  }
});

test('preparation validates additional categories in the same mall and snapshots them for preview', async () => {
  const h = apiHarness(); h.modes.taxonomyTree = true;
  h.tables.product_items[0].automation.categorySelections = { retail: ['001001', '001'], wholesale: ['002001'] };
  const response = await h.request('/godomall/retail/operations/prepare', 'POST', { kind: 'insert', itemId: API_ITEM, choices: { brandCd: '001', scmNo: '99' } });
  assert.equal(response.status, 201);
  const result = await response.json() as any;
  assert.deepEqual(result.operation.product_preview.categories.map((category: any) => category.code), ['001001', '001']);
  assert.deepEqual(result.operation.product_preview.categories.map((category: any) => category.name), ['분류 001001', '분류 001']);
  const submitted = child(parseXml(h.tables.godomall_operations[0].payload_xml), 'goods_data')!;
  assert.equal(value(submitted, 'cateCd'), '001001'); assert.equal(value(submitted, 'allCateCd'), '001001|001'); assert.equal(value(submitted, 'scmNo'), '1');
  assert.equal(h.calls.filter(call => call.endpoint === 'Goods_Insert.php').length, 0);
  assert.ok(h.calls.every(call => call.mall === 'retail'));
});

test('an invalid extra category blocks preparation before any remote insert', async () => {
  const h = apiHarness();
  h.tables.product_items[0].automation.categorySelections = { retail: ['001001', '002001'], wholesale: ['002001'] };
  const response = await h.request('/godomall/retail/operations/prepare', 'POST', { kind: 'insert', itemId: API_ITEM, choices: { brandCd: '001' } });
  assert.equal(response.status, 422);
  assert.equal(h.tables.godomall_operations.length, 0);
  assert.equal(h.calls.filter(call => call.endpoint === 'Goods_Insert.php').length, 0);
});

test('new registration accepts omitted supplier and fixes both malls to head office', async () => {
  for (const mall of ['retail', 'wholesale'] as const) {
    const h = apiHarness();
    const response = await h.request(`/godomall/${mall}/operations/prepare`, 'POST', { kind: 'insert', itemId: API_ITEM, choices: { brandCd: '001' } });
    assert.equal(response.status, 201);
    assert.equal(h.tables.godomall_operations[0].expected.scmNo, '1');
  }
});

test('draft API persists ordered categories and disabled prefix text, rejecting malformed selections', async () => {
  const h = apiHarness(), product = structuredClone(h.tables.product_items[0]);
  product.automation.categorySelections = { retail: ['001001', '003001', '004001'], wholesale: ['002001'] };
  product.automation.namePrefix = { enabled: false, text: '[예약판매]' };
  const saved = await h.request(`/items/${API_ITEM}`, 'PUT', { item: product, revision: product.updated_at });
  assert.equal(saved.status, 200);
  const result = await saved.json() as any;
  assert.deepEqual(result.item.automation.categorySelections, product.automation.categorySelections);
  assert.deepEqual(result.item.automation.namePrefix, { enabled: false, text: '[예약판매]' });
  for (const codes of [['001001', '001001'], ['001001', 'bad'], ['001001', '']]) {
    const input = structuredClone(result.item); input.automation.categorySelections.retail = codes;
    const response = await h.request(`/items/${API_ITEM}`, 'PUT', { item: input, revision: result.item.updated_at });
    assert.equal(response.status, 422);
    assert.deepEqual(h.tables.product_items[0].automation.categorySelections, product.automation.categorySelections);
  }
});
