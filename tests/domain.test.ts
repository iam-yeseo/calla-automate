import test from 'node:test';
import assert from 'node:assert/strict';
import { automationPayload, canRun, core, duplicateProduct, listState, money, newProduct, parsePrice, prepareDraft, supportsProductSetup } from '../src/domain.ts';
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

test('verified registration in every required mall completes a list without changing manual completion', () => {
  const list: ProductList = { id: LIST, title: 'API 등록 완료', author: '', work_date: '2026-10-19', created_at: '', total: 6, doneCount: 0, retailTotal: 6, retailSuccess: 6, wholesaleTotal: 6, wholesaleSuccess: 6 };
  const before = structuredClone(list);
  assert.equal(listState(list), 'success');
  assert.deepEqual(list, before);
  assert.equal(listState({ ...list, retailTotal: 0, retailSuccess: 0 }), 'success');
  assert.equal(listState({ ...list, wholesaleTotal: 0, wholesaleSuccess: 0 }), 'success');
  assert.equal(listState({ ...list, runningCount: 1 }), 'running');
  assert.equal(listState({ ...list, failedCount: 1 }), 'warning');
  assert.equal(listState({ ...list, failedCount: 1, runningCount: 1 }), 'warning');
});

test('list registration completion requires nonempty, explicit and complete per-mall results', () => {
  const list: ProductList = { id: LIST, title: '등록 대기', author: '', work_date: '2026-10-19', created_at: '', total: 2, doneCount: 0, retailTotal: 2, retailSuccess: 2, wholesaleTotal: 2, wholesaleSuccess: 2 };
  for (const incomplete of [
    { wholesaleSuccess: 1 }, { retailSuccess: 1 }, { retailSuccess: undefined },
    { retailSuccess: 3, wholesaleSuccess: 1 },
    { retailTotal: undefined }, { wholesaleTotal: undefined },
    { retailTotal: 0, wholesaleTotal: 0, retailSuccess: 0, wholesaleSuccess: 0 },
    { total: 0 }, { total: undefined },
  ]) assert.equal(listState({ ...list, ...incomplete }), 'pending', JSON.stringify(incomplete));
});

test('stock defaults to unlimited zero, validates integers and survives save/copy/export', () => {
  const p=product();
  assert.deepEqual(p.automation.stock,{mode:'unlimited',quantity:0});
  assert.deepEqual(core.normalize({}).stock,{mode:'unlimited',quantity:0});
  p.automation.stock={mode:'limited',quantity:0};
  assert.equal(core.stockIssue(p.automation),'');
  p.automation.stock.quantity=17;
  for(const value of [prepareDraft([p])[0].automation,duplicateProduct(p).automation]) assert.deepEqual((value as any).stock,p.automation.stock);
  assert.deepEqual(automationPayload(LIST,[p],settings,true).items[0].stock,p.automation.stock);
  for(const quantity of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) assert.ok(core.stockIssue({...p.automation,stock:{mode:'limited',quantity}}));
});

test('ordered mixed detail content retains exact raw code through normalization/save/copy/export', () => {
  const p=product(),image=p.automation.detailImages[0];
  const raw='  <!-- keep -->\n<iframe src="https://example.com/embed?a=1&b=2"></iframe>\n텍스트 &amp; <B data-case="YES">그대로</B>\n ';
  p.automation=core.withDetailBlocks(p.automation,[{id:'img-b',type:'image',image:{...image,filename:'second.jpg'}},{id:'raw',type:'text',text:raw},{id:'img-a',type:'image',image}]);
  const expected=core.html([{...image,filename:'second.jpg'}])+raw+core.html([image]);
  const saved=(prepareDraft([p])[0].automation as Product['automation']);
  assert.equal(saved.detailHtml,expected);
  assert.equal(core.detailHtml(core.normalize(saved)),expected);
  assert.equal(core.detailHtml(duplicateProduct({...p,automation:saved}).automation),expected);
  assert.equal(automationPayload(LIST,[p],settings,true).items[0].detailHtml,expected);
  assert.deepEqual(saved.detailImages.map(i=>i.filename),['second.jpg',image.filename]);
  assert.equal(saved.detailBlocks?.[1].type,'text');
  assert.equal((saved.detailBlocks?.[1] as any).text,raw);
});

test('text-only details need no image validation and old image-only markup is unchanged', () => {
  const p=product(),legacy=core.html(p.automation.detailImages);
  assert.equal(core.detailHtml(p.automation),legacy);
  const raw=' \n<script type="application/ld+json">{"name":"x&y"}</script>\n ';
  p.automation=core.withDetailBlocks(p.automation,[{id:'text',type:'text',text:raw}]);
  assert.equal(core.detailHtml(p.automation),raw);
  assert.deepEqual(core.readyIssues(p,settings),[]);
  p.automation=core.withDetailBlocks(p.automation,[]);
  assert.equal(core.detailHtml(p.automation),'');
  assert.ok(core.readyIssues(p,settings).some(s=>s.includes('상세')));
  assert.equal(core.detailHtml(core.normalize({detailHtml:raw})),raw,'legacy HTML must survive opening and saving');
});

test('old runners cannot silently ignore stock or raw detail content', () => {
  for(const version of [undefined,'','1.0.2','invalid']) assert.equal(supportsProductSetup(version),false);
  for(const version of ['1.1.0','1.2.3','2.0.0']) assert.equal(supportsProductSetup(version),true);
});

test('origin presets and English countries normalize once while unknown legacy values remain editable', () => {
  for (const [value, expected] of [['대한민국', 'Korea'], ['한국', 'Korea'], ['국내산', 'Korea'], ['South Korea', 'Korea'], ['중국', 'China'], ['일본', 'Japan'], ['미국', 'USA'], ['United States', 'USA'], ['Germany', 'Germany'], ["Cote d'Ivoire", "Cote d'Ivoire"], ['Timor-Leste', 'Timor-Leste']]) {
    const origin = `Made in ${expected}`;
    assert.equal(core.normalize({origin:value}).origin, origin);
    assert.equal(core.normalizeOrigin(origin), origin);
    assert.equal(core.originCountry(origin), expected);
    assert.equal(core.originIssue(origin), '');
  }
  assert.equal(core.normalizeOrigin(''), '');
  for (const invalid of ['독일', 'Made in ', 'Made in Made in Germany', '<b>Germany</b>', 'Germany123']) {
    assert.equal(core.normalizeOrigin(invalid), invalid.trim());
    assert.ok(core.originIssue(invalid));
  }
  const item=product(); item.automation.origin='중국';
  assert.equal(automationPayload(LIST,[item],settings,true).items[0].origin,'Made in China');
  assert.equal((prepareDraft([item])[0].automation as Product['automation']).origin,'Made in China');
});

test('wholesale regular price follows retail unless manually overridden, preserving zero and null', () => {
  const item=product(); item.price_retail=12000;
  assert.deepEqual(core.normalize({}).wholesaleRegularPrice,{mode:'retail',value:null});
  assert.equal(core.wholesaleRegularPrice(item),12000);
  item.automation.wholesaleRegularPrice={mode:'retail',value:999};
  assert.equal(core.wholesaleRegularPrice(item),12000);
  assert.deepEqual(core.normalize(item.automation).wholesaleRegularPrice,{mode:'retail',value:null});
  item.price_retail=15000;
  assert.equal(core.wholesaleRegularPrice(item),15000);
  item.automation.wholesaleRegularPrice={mode:'manual',value:9000};
  assert.equal(core.wholesaleRegularPrice(item),9000);
  assert.deepEqual(duplicateProduct(item).automation.wholesaleRegularPrice,{mode:'manual',value:9000});
  assert.deepEqual((prepareDraft([item])[0].automation as Product['automation']).wholesaleRegularPrice,{mode:'manual',value:9000});
  for (const value of [0,null]) {
    item.automation.wholesaleRegularPrice={mode:'manual',value};
    assert.equal(core.wholesaleRegularPrice(item),value);
    assert.equal(automationPayload(LIST,[item],settings,true).items[0].price_wholesale_regular,value);
  }
  item.automation.wholesaleRegularPrice={mode:'retail',value:null};
  item.price_retail=null;
  assert.equal(core.wholesaleRegularPrice(item),null);
  for (const value of [-1,0.5,Number.MAX_SAFE_INTEGER+1]) {
    item.automation.wholesaleRegularPrice={mode:'manual',value};
    assert.ok(core.readyIssues(item,settings).some(issue=>issue.includes('도매 정가')));
  }
});

test('literal markup is a nonempty basic product name while whitespace alone remains invalid', () => {
  const item=product(); item.name_own='<b></b>';
  assert.ok(!core.readyIssues(item,settings).some(issue=>issue.includes('상품명')));
  assert.equal(automationPayload(LIST,[item],settings,true).items[0].name_own,'<b></b>');
  item.name_own='  ';
  assert.ok(core.readyIssues(item,settings).some(issue=>issue.includes('상품명')));
});
