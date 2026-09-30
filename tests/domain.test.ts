import test from 'node:test';
import assert from 'node:assert/strict';
import { automationPayload, canRun, core, duplicateProduct, listState, money, newProduct, parsePrice, prepareDraft } from '../src/domain.ts';
import type { Product, ProductList, Registration, Settings } from '../src/types.ts';
type ExportedProduct = Product & { detailImages: Product['automation']['detailImages']; detailHtml: string; issues: string[]; categoryPaths: { retail: string; wholesale: string }; brandCode: string };

const LIST = '11111111-1111-4111-8111-111111111111';
const OTHER = '44444444-4444-4444-8444-444444444444';
const settings: Settings = {
  schemaVersion: 1, folders: ['audio'], brands: [{ code: '000007', name: 'AVMATRIX' }],
  categories: {
    retail: [{ code: '003', name: '음향', parentCode: '' }, { code: '003001', name: '믹서', parentCode: '003' }],
    wholesale: [{ code: '001', name: '도매', parentCode: '' }],
  },
};
function product(): Product {
  const value = newProduct(LIST, 7);
  const image = { folder: 'audio', filename: 'avmatrix-p12.jpg', linkEnabled: true, linkUrl: 'https://example.com/detail?sku=1&mode=full', validation: { status: 'valid' as const, url: 'https://calla.hgodo.com/product/audio/avmatrix-p12.jpg' } };
  return { ...value, name_own: '<font color="#ff0000">P12 / 믹서 &amp; 스위처</font>', brand: 'AVMATRIX', model: 'P12', image_url: 'https://example.com/thumb.jpg', content: '기존 안내', image_usage: '기존 사용 조건', automation: { ...value.automation, categoryCodes: { retail: '003001', wholesale: '001' }, detailImages: [image], futureProperty: { preserve: true } } };
}

test('draft serialization omits server-owned completion state without mutating the completed source', () => {
  const original = { ...product(), done: true, done_at: '2026-09-30T00:00:00Z', created_at: '2026-09-20T00:00:00Z', updated_at: '2026-09-29T00:00:00Z' };
  const snapshot = structuredClone(original);
  const second = product();
  const draft = prepareDraft([original, second]);
  assert.deepEqual(original, snapshot);
  assert.equal(draft[0].seq, 1); assert.equal(draft[1].seq, 2);
  for (const key of ['done', 'done_at', 'created_at', 'updated_at']) assert.ok(!(key in draft[0]), key);
  assert.equal(draft[0].content, original.content); assert.equal(draft[0].image_usage, original.image_usage);
  const automation = draft[0].automation as Product['automation'];
  assert.deepEqual(automation.futureProperty, { preserve: true });
  assert.equal(automation.detailImages[0].linkUrl, original.automation.detailImages[0].linkUrl);
  assert.match(automation.detailHtml!, /href="https:\/\/example.com\/detail\?sku=1&amp;mode=full"/);
});

test('HTML names remain raw in stored/exported data and use plain text for display and Naver names', () => {
  const original = product(); const raw = original.name_own;
  assert.equal(core.displayName(raw), 'P12 / 믹서 & 스위처');
  assert.equal(core.smartName(raw), 'P12 믹서 & 스위처');
  assert.equal(core.displayName('<script>alert(1)</script><b>안전한 목록</b>'), '안전한 목록');
  assert.equal(prepareDraft([original])[0].name_own, raw);
  const exported = automationPayload(LIST, [original], settings, true).items[0] as ExportedProduct;
  assert.equal(exported.name_own, raw); assert.equal(original.name_own, raw);
  assert.equal(exported.detailImages[0].linkEnabled, true);
  assert.equal(exported.detailImages[0].linkUrl, original.automation.detailImages[0].linkUrl);
  assert.match(exported.detailHtml, /target="_blank" rel="noopener noreferrer"/);
  const invalid = { ...original.automation.detailImages[0], linkUrl: 'javascript:alert(1)' };
  assert.equal(core.html([invalid]), '');
  assert.ok(core.readyIssues({ ...original, automation: { ...original.automation, detailImages: [invalid] } }, settings).some((issue: string) => issue.includes('바로가기 링크')));
});

test('duplicate creates an independent unfinished item and preserves leading-zero category codes', () => {
  const original = { ...product(), done: true, done_at: '2026-09-30T00:00:00Z', created_at: '2026-09-20T00:00:00Z', updated_at: '2026-09-29T00:00:00Z' };
  const copy = duplicateProduct(original, OTHER);
  assert.notEqual(copy.id, original.id); assert.equal(copy.list_id, OTHER);
  assert.equal(copy.done, false); assert.equal(copy.done_at, null);
  assert.equal(copy.created_at, undefined); assert.equal(copy.updated_at, undefined);
  assert.deepEqual(copy.automation.categoryCodes, { retail: '003001', wholesale: '001' });
  assert.equal(copy.name_own, original.name_own); assert.deepEqual(copy.automation.futureProperty, { preserve: true });
  copy.automation.detailImages[0].linkUrl = 'https://example.com/changed';
  assert.notEqual(copy.automation.detailImages[0].linkUrl, original.automation.detailImages[0].linkUrl);
  assert.equal(original.done, true);
});

test('empty prices stay null, zero stays numeric and invalid money is rejected', () => {
  assert.equal(parsePrice(''), null); assert.equal(parsePrice('   '), null); assert.equal(parsePrice('0'), 0); assert.equal(parsePrice('12,300'), 12300);
  for (const input of ['-1', '2.5', 'NaN', 'Infinity', '9007199254740992', '금액']) assert.throws(() => parsePrice(input));
  assert.equal(money(null), '—'); assert.equal(money(undefined), '—'); assert.equal(money(0), '0');
  const fresh = newProduct(LIST, 1);
  for (const key of ['price_retail_regular', 'price_retail', 'price_wholesale', 'price_wholesale_master', 'price_naver']) assert.equal(fresh[key], null);
  assert.equal(prepareDraft([fresh])[0].price_retail, null);
});

test('copies require a new owned thumbnail while preserving the original and independent external images', () => {
  const source=product();
  source.image_url='https://project.supabase.co/storage/v1/object/public/product-thumbnails/list/item/a.jpg';
  source.automation.thumbnail={path:'list/item/a.jpg',url:source.image_url};
  const snapshot=structuredClone(source),copy=duplicateProduct(source);
  assert.equal(copy.image_url,'');
  assert.ok(!copy.automation.thumbnail?.path && !copy.automation.thumbnail?.url);
  assert.deepEqual(source,snapshot);
  assert.deepEqual(copy.automation.detailImages,source.automation.detailImages);
  assert.equal(duplicateProduct(product()).image_url,'https://example.com/thumb.jpg');
});

test('automation payload retains readiness envelope, save state and source contract without claiming execution', () => {
  const ready = product(); const invalid = { ...product(), image_url: '' };
  const payload = automationPayload(LIST, [ready, invalid], settings, false);
  const [readyExport, invalidExport] = payload.items as ExportedProduct[];
  assert.equal(payload.schemaVersion, 1); assert.equal(payload.ready, true); assert.equal(payload.saved, false); assert.equal(payload.listId, LIST);
  assert.deepEqual(readyExport.issues, []); assert.ok(invalidExport.issues.includes('썸네일 미등록'));
  assert.deepEqual(payload.items[0].categoryCodes, { retail: '003001', wholesale: '001' });
  assert.equal(readyExport.categoryPaths.retail, '음향 > 믹서'); assert.equal(readyExport.brandCode, '000007');
  assert.equal(payload.items[0].done, false); assert.equal(payload.items[0].price_retail, null);
  assert.equal(automationPayload(LIST, [ready], settings, true).saved, true);
});

test('run eligibility excludes completed/running channels and stale image checks, without treating Naver as implemented', () => {
  const item = product();
  const status = (channel: Registration['channel'], state: Registration['status']): Registration => ({ item_id: item.id, channel, status: state });
  assert.equal(canRun(item, [], settings), true);
  assert.equal(canRun(item, [status('retail', 'success'), status('wholesale', 'failed')], settings), true);
  assert.equal(canRun(item, [status('retail', 'success'), status('wholesale', 'running')], settings), false);
  assert.equal(canRun({ ...item, done: true }, [], settings), false);
  assert.equal(canRun({ ...item, need_retail: '불필요', need_wholesale: '불필요', need_naver: '필요' }, [], settings), false);
  const stale = structuredClone(item); stale.automation.detailImages[0].filename = 'changed.jpg';
  assert.equal(canRun(stale, [], settings), false);
});

test('empty lists remain pending and failures/running take priority over manual completion', () => {
  const list = { id: LIST, title: '목록', author: '', work_date: '2026-09-30', created_at: '', total: 0, doneCount: 0 } as ProductList;
  assert.equal(listState(list), 'pending');
  assert.equal(listState({ ...list, total: 1, doneCount: 1 }), 'success');
  assert.equal(listState({ ...list, total: 1, doneCount: 1, runningCount: 1 }), 'running');
  assert.equal(listState({ ...list, total: 1, doneCount: 1, runningCount: 1, failedCount: 1 }), 'warning');
});
