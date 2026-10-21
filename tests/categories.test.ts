import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { categoryLevels, categoryRows } from '../src/categories.ts';
import { core, newProduct, prepareDraft } from '../src/domain.ts';
import type { Category, Settings } from '../src/types.ts';
// Provide only the optional desktop bridge for server-side component rendering.
Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
const { default: CategorySelect } = await import('../src/CategorySelect.tsx');
const settings: Settings = JSON.parse(readFileSync(new URL('../src/data/automation-settings.json', import.meta.url), 'utf8'));

test('parent selection restricts children and changing the root clears the old child', () => {
  const initial = categoryLevels(settings.categories.retail, '');
  assert.equal(initial[0].options.length, 27);
  assert.ok(initial[0].options.every(c => !c.parentCode));
  assert.deepEqual(initial[1].options, []);
  const selected = categoryLevels(settings.categories.retail, '007005001');
  assert.deepEqual(selected.map(l => l.value), ['007', '007005', '007005001']);
  assert.deepEqual(selected[2].options.map(c => c.code), ['007005001', '007005002']);
  const changed = categoryLevels(settings.categories.retail, '009');
  assert.deepEqual(changed.map(l => l.value), ['009', '']);
  assert.ok(changed[1].options.every(c => c.parentCode === '009'));
});

test('each mall retains its own hierarchy, including parent-only and four-level selection', () => {
  assert.equal(categoryLevels(settings.categories.wholesale, '009008')[1].value, '009008');
  assert.equal(categoryLevels(settings.categories.retail, '009008')[1].value, '');
  assert.deepEqual(categoryLevels(settings.categories.retail, '027').map(l => l.value), ['027', '']);
  const cats: Category[] = ['001', '001001', '001001001', '001001001001'].map(code => ({ code, name: code, parentCode: code.slice(0, -3) }));
  assert.deepEqual(categoryLevels(cats, '001001001001').map(l => l.value), cats.map(c => c.code));
});

test('management lists one level at a time and searches the chosen branch or all categories', () => {
  assert.equal(categoryRows(settings.categories.retail, '', '').length, 27);
  assert.equal(categoryRows(settings.categories.retail, '007', '').length, 5);
  assert.deepEqual(categoryRows(settings.categories.retail, '007005', '').map(c => c.code), ['007005001', '007005002']);
  assert.equal(categoryRows(settings.categories.retail, '', 'FlexScan')[0].code, '007005002');
  assert.equal(categoryRows(settings.categories.retail, '009', 'FlexScan').length, 0);
  assert.equal(categoryRows(settings.categories.wholesale, '009', '세트 상품')[0].code, '009008');
});

test('inactive and unknown saved codes remain visible and do not mutate the product', () => {
  const categories = structuredClone(settings.categories.retail);
  categories.find(c => c.code === '007005001')!.active = false;
  const p = newProduct('11111111-1111-4111-8111-111111111111', 1);
  p.automation.categoryCodes = { retail: '007005001', wholesale: '009008' };
  const before = structuredClone(p);
  const html = renderToStaticMarkup(createElement(CategorySelect, { categories, label: '소매 카테고리', value: p.automation.categoryCodes.retail, disabled: true, onChange: () => assert.fail('render must not change saved data') }));
  assert.match(html, /ColorEdge 모니터/); assert.match(html, /사용 중지/); assert.match(html, /disabled/);
  const unknown = renderToStaticMarkup(createElement(CategorySelect, { categories, label: '소매 카테고리', value: '999001', onChange: () => assert.fail('unknown category must be retained') }));
  assert.match(unknown, /저장된 코드 999001/);
  assert.deepEqual(p, before);
  assert.deepEqual((prepareDraft([p])[0].automation as typeof p.automation).categoryCodes, before.automation.categoryCodes);
});

test('bundled settings match the complete live category snapshot and include used', () => {
  const snapshot = JSON.parse(readFileSync(new URL('../docs/data/godomall-categories-2026-10-02.json', import.meta.url), 'utf8'));
  core.validateSettings(structuredClone(settings));
  for (const channel of ['retail', 'wholesale'] as const) {
    assert.deepEqual(settings.categories[channel].map(({ code, name, parentCode }) => ({ code, name, parentCode })).sort((a,b) => a.code.localeCompare(b.code)), snapshot.categories[channel]);
  }
  assert.equal(settings.categories.retail.length, 148); assert.equal(settings.categories.wholesale.length, 136);
  assert.equal(settings.folders.length, 22); assert.equal(settings.folders.filter(f => f === 'used').length, 1);
  assert.equal(core.imageUrl({ folder: 'used', filename: 'calla-item.jpg' }), 'https://calla.hgodo.com/product/used/calla-item.jpg');
});
