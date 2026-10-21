import test from 'node:test';
import assert from 'node:assert/strict';
import { mismatches, prepareInsert, prepareUpdate } from '../server/godomall-mapping';
import { child, children, parseXml, setValue, value, xmlNode } from '../server/godomall-xml';
import { apiHarness, API_ITEM, defaultInsertCodes, sourceProduct } from './fixtures/godomall';

const imageFields = ['magnifyImageData', 'detailImageData', 'listImageData', 'mainImageData'];
const choices = { ...defaultInsertCodes, brandCd: '001', scmNo: '1' };
const mapped = () => prepareInsert(sourceProduct(), 'retail', 'CA_image_test', choices);
const storedImages = () => xmlNode('goods_data', '', [
  xmlNode('imageStorage', 'local'),
  ...imageFields.map(field => xmlNode(field, `https://godomall-storage.cdn-nhncommerce.com/shop/goods/1000000001/${field}.jpg`)),
]);

test('both malls import all product images into default storage and use the mall resize settings', () => {
  for (const mall of ['retail', 'wholesale'] as const) {
    const p = sourceProduct(), prepared = prepareInsert(p, mall, 'CA_image_test', choices);
    const payload = child(parseXml(prepared.xml), 'goods_data')!;
    assert.equal(value(payload, 'imageStorage'), 'local');
    for (const field of imageFields) {
      assert.equal(value(payload, field), p.image_url);
      assert.equal(child(payload, field)?.attributes.image_size_decrease, 'Y');
      assert.equal(prepared.expected[field], p.image_url);
    }
    assert.equal(value(payload, 'goodsDescription'), p.automation.detailHtml);
    assert.equal(value(payload, 'goodsDescriptionMobile'), p.automation.detailHtml);
    p.image_url = '';
    const empty = prepareInsert(p, mall, 'CA_image_test', choices);
    assert.equal(value(empty.node, 'imageStorage'), 'local');
    assert.ok(empty.warnings.some(w => w.includes('대표 이미지가 비어')));
    assert.ok(imageFields.every(field => !child(empty.node, field) && !(field in empty.expected)));
  }
});

test('local image verification accepts rewritten URLs but rejects missing, source-only or unusable images', () => {
  const expected = { imageStorage: 'local', ...Object.fromEntries(imageFields.map(field => [field, sourceProduct().image_url!])) };
  assert.deepEqual(mismatches(expected, storedImages()), []);
  for (const field of imageFields) {
    const missing = storedImages(); missing.children = missing.children.filter(n => n.name !== field);
    assert.deepEqual(mismatches(expected, missing), [field]);
    for (const invalid of ['', ' ', 'not-an-image', 'javascript:alert(1)', 'data:image/png;base64,AA', 'https://u:p@mall.test/image.jpg', 'https://mall.test/', sourceProduct().image_url!, `${sourceProduct().image_url}#fragment`]) {
      const actual = storedImages(); setValue(actual, field, invalid);
      assert.deepEqual(mismatches(expected, actual), [field], `${field}: ${invalid}`);
    }
    const duplicate = storedImages(); duplicate.children.push(xmlNode(field, 'https://mall.test/extra.jpg'));
    assert.deepEqual(mismatches(expected, duplicate), [field]);
  }
  const urlMode = storedImages(); setValue(urlMode, 'imageStorage', 'url');
  assert.deepEqual(mismatches(expected, urlMode), ['imageStorage', ...imageFields]);
  const actual = structuredClone(mapped().node);
  for (const field of imageFields) setValue(actual, field, value(storedImages(), field)!);
  setValue(actual, 'goodsPrice', '999');
  assert.deepEqual(mismatches(mapped().expected, actual), ['판매가']);
});

test('legacy URL verification remains exact and ordinary updates retain either image storage mode', () => {
  const original = sourceProduct().image_url!;
  const legacy = { imageStorage: 'url', listImageData: original };
  const actual = xmlNode('goods_data', '', [xmlNode('imageStorage', 'url'), xmlNode('listImageData', original)]);
  assert.deepEqual(mismatches(legacy, actual), []);
  setValue(actual, 'listImageData', 'https://mall.test/different.jpg');
  assert.deepEqual(mismatches(legacy, actual), ['listImageData']);
  for (const storage of ['url', 'local']) {
    const before = mapped().node; setValue(before, 'imageStorage', storage);
    for (const field of imageFields) setValue(before, field, storage === 'url' ? original : value(storedImages(), field)!);
    const update = prepareUpdate(before, { goodsPrice: '2000' });
    assert.equal(value(update.node, 'imageStorage'), storage);
    assert.equal(value(update.node, 'imageUpdate'), 'N');
    assert.ok(imageFields.every(field => children(update.node, field).length === 0));
    const after = structuredClone(before); setValue(after, 'goodsPrice', '2000');
    assert.deepEqual(mismatches(update.expected, after), []);
    setValue(after, 'listImageData', 'https://mall.test/replaced.jpg');
    assert.deepEqual(mismatches(update.expected, after), ['__preserve_listImageData']);
  }
});

async function prepare(h: ReturnType<typeof apiHarness>, mall = 'retail') {
  const response = await h.request(`/godomall/${mall}/operations/prepare`, 'POST', { kind: 'insert', itemId: API_ITEM, choices });
  assert.equal(response.status, 201);
  return (await response.json() as any).operation;
}

test('both malls complete a local image import while the preview retains the source thumbnail', async () => {
  for (const mall of ['retail', 'wholesale'] as const) {
    const h = apiHarness(), op = await prepare(h, mall);
    assert.equal(op.product_preview.thumbnailUrl, sourceProduct().image_url);
    const path = `/godomall/${mall}/operations/${op.id}/execute`;
    const response = await h.request(path, 'POST', { confirmed: true });
    assert.equal(response.status, 200);
    const result = (await response.json() as any).operation;
    assert.equal(result.state, 'success');
    assert.equal(result.product_preview.thumbnailUrl, sourceProduct().image_url);
    const remote = h.remote[mall].get(result.goods_no)!;
    assert.equal(value(remote, 'imageStorage'), 'local');
    assert.ok(imageFields.every(field => value(remote, field)?.startsWith(`https://images.${mall}.test/`)));
    await h.request(path, 'POST', { confirmed: true });
    assert.equal(h.calls.filter(call => call.endpoint === 'Goods_Insert.php').length, 1);
  }
});

test('incomplete image imports remain reviewable and are never submitted twice', async () => {
  for (const mode of ['missing-image-list', 'image-source-echo', 'image-storage-url']) {
    const h = apiHarness(); h.modes.insert = mode;
    const op = await prepare(h), path = `/godomall/retail/operations/${op.id}`;
    const response = await h.request(`${path}/execute`, 'POST', { confirmed: true });
    const result = (await response.json() as any).operation;
    assert.equal(result.state, 'needs_review', mode);
    assert.equal(result.goods_no, '1000000001');
    assert.match(result.error_message, /ImageData|imageStorage/);
    await h.request(`${path}/execute`, 'POST', { confirmed: true });
    assert.equal(h.calls.filter(call => call.endpoint === 'Goods_Insert.php').length, 1);
    const remote = h.remote.retail.get(result.goods_no)!;
    setValue(remote, 'imageStorage', 'local');
    for (const field of imageFields) setValue(remote, field, value(storedImages(), field)!);
    const retry = await h.request(`${path}/verify`, 'POST', {});
    assert.equal((await retry.json() as any).operation.state, 'success');
    assert.equal(h.calls.filter(call => call.endpoint === 'Goods_Insert.php').length, 1);
  }
});

test('an old URL-storage preview must be prepared again before sending a new product', async () => {
  const h = apiHarness(), op = await prepare(h);
  h.tables.godomall_operations[0].expected.imageStorage = 'url';
  const response = await h.request(`/godomall/retail/operations/${op.id}/execute`, 'POST', { confirmed: true });
  assert.equal(response.status, 409);
  assert.equal((await response.json() as any).error.code, 'image_storage_changed');
  assert.equal(h.tables.godomall_operations[0].state, 'prepared');
  assert.equal(h.calls.filter(call => call.endpoint === 'Goods_Insert.php').length, 0);
});
