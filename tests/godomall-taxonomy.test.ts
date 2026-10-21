import test from 'node:test';
import assert from 'node:assert/strict';
import { sameManagedTaxonomy, syncTaxonomy, type TaxonomySync } from '../server/godomall-taxonomy';
import type { GodomallDb } from '../server/godomall';
import type { GodomallClient } from '../server/godomall-client';
import { GodomallError } from '../server/godomall-xml';
import { resolveBrand, registrationBlocked } from '../src/mall-settings';
import type { Settings } from '../src/types';
import { sourceProduct } from './fixtures/godomall';

const settings = (): Settings => ({ schemaVersion: 1, categories: { retail: [{ code: '001', name: '이전 분류', parentCode: '', folder: 'audio' }], wholesale: [{ code: '090', name: '도매 전용', parentCode: '' }] }, brands: [{ name: 'CALLA', code: '999' }], brandsByMall: { retail: [{ name: 'CALLA', code: '001' }], wholesale: [{ name: 'CALLA', code: '027' }] }, folders: ['audio'] });
function harness() {
  const rows = new Map<string, TaxonomySync>(), published: any[] = [], calls: string[] = [];
  let failParent: string | undefined;
  const db = (async (table, query = {}, method = 'GET', payload: any) => {
    const key = `${query.mall_id?.slice(3)}:${query.kind?.slice(3)}`;
    if (table.startsWith('rpc/')) { published.push(payload); const row = rows.get(`${payload.p_mall}:${payload.p_kind}`)!; if (row.updated_at !== payload.p_revision) return { data: structuredClone(row) }; Object.assign(row, { status: 'success', collected: payload.p_items, visited: payload.p_visited, pending: [], synced_at: new Date().toISOString() }); return { data: structuredClone(row) }; }
    if (method === 'POST') { rows.set(`${payload.mall_id}:${payload.kind}`, structuredClone(payload)); return { data: [] }; }
    const row = rows.get(key);
    if (method === 'PATCH') { if (!row || row.updated_at !== query.updated_at?.slice(3)) return { data: [] }; Object.assign(row, structuredClone(payload)); }
    return { data: row ? [structuredClone(row)] : [] };
  }) as GodomallDb;
  const children: Record<string, string[]> = { '': ['001', '002', '003', '004'], '001': ['001001'], '001001': ['001001001'], '001001001': ['001001001001'] };
  const client = { mall: 'retail', codes: async (_kind: string, parent: string) => { calls.push(parent); if (parent === failParent) throw new GodomallError(502, '일시적인 조회 실패', 'unavailable'); return (children[parent] || []).map(code => ({ code, name: `분류 ${code}`, fields: { cateDisplayFl: 'y', cateDisplayMobileFl: 'n' } })); } } as unknown as GodomallClient;
  return { db, client, rows, published, calls, children, fail(parent?: string) { failParent = parent; } };
}
test('taxonomy traverses every level with leading zeroes and publishes only after the whole tree is read', async () => {
  const h = harness(); const first = await syncTaxonomy(h.db, h.client, 'categories', true);
  assert.equal(first!.status, 'syncing'); assert.equal(h.calls.length, 4); assert.equal(h.published.length, 0);
  const last = await syncTaxonomy(h.db, h.client, 'categories', false);
  assert.equal(last!.status, 'success'); assert.equal(last!.count, 7); assert.equal(h.published.length, 1);
  assert.deepEqual(h.published[0].p_items.at(-1), { code: '004', name: '분류 004', parentCode: '', active: true, display: 'y', displayMobile: 'n' });
  assert.equal(h.published[0].p_items.find((r: any) => r.code === '001001001001').parentCode, '001001001');
  assert.equal(h.calls.filter(p => p === '').length, 1);
});
test('failed reads leave the prior published settings intact and retry resumes the failed parent', async () => {
  const h = harness(); h.fail('002'); const failed = await syncTaxonomy(h.db, h.client, 'brands', true);
  assert.equal(failed!.status, 'failed'); assert.equal(h.published.length, 0); assert.equal(h.rows.get('retail:brands')!.pending[0], '002');
  h.fail(); let status; do { status = await syncTaxonomy(h.db, h.client, 'brands', false); } while (status!.status === 'syncing');
  assert.equal(status!.status, 'success'); assert.equal(h.calls.filter(p => p === '').length, 1); assert.equal(h.published[0].p_kind, 'brands');
});
test('foreign parent, missing intermediate parent and an empty category tree cannot overwrite saved settings', async () => {
  for (const mode of ['foreign', 'orphan', 'empty']) {
    const h = harness(); if (mode === 'foreign') h.children['001'] = ['090001']; else if (mode === 'orphan') h.children[''] = ['001001']; else h.children[''] = [];
    let status; do { status = await syncTaxonomy(h.db, h.client, 'categories', true); } while (status!.status === 'syncing');
    assert.equal(status!.status, 'failed'); assert.equal(h.published.length, 0);
  }
});
test('master categories, brands and sync dates are immutable but local image folder mappings remain editable', () => {
  const a = settings(), b = structuredClone(a); b.categories.retail[0].folder = ''; b.folders.push('video'); assert.ok(sameManagedTaxonomy(a, b));
  for (const mutate of [(v: Settings) => v.categories.retail[0].name = '새 이름', (v: Settings) => v.categories.wholesale[0].code = '001', (v: Settings) => v.brandsByMall!.wholesale[0].code = '001', (v: Settings) => v.taxonomySyncedAt = { retail: { brands: 'fake' } }]) { const next = structuredClone(a); mutate(next); assert.equal(sameManagedTaxonomy(a, next), false); }
});
test('the same brand resolves to independent mall codes and never falls back to the legacy shared brand code', () => {
  const p = sourceProduct(), s = settings(); assert.equal(resolveBrand(p, s, 'retail'), '001'); assert.equal(resolveBrand(p, s, 'wholesale'), '027');
  delete s.brandsByMall; assert.equal(resolveBrand(p, s, 'retail'), '');
  s.brandsByMall = settings().brandsByMall; p.automation.brandCodes = { retail: '027', wholesale: '' }; assert.equal(resolveBrand(p, s, 'retail'), ''); assert.equal(resolveBrand(p, s, 'wholesale'), '');
});
test('registration selection blocks ambiguous and existing receipts per mall, allowing an explicitly deleted item again', () => {
  const p = sourceProduct(); p.need_wholesale = '필요';
  assert.equal(registrationBlocked(p, [{ item_id: p.id, channel: 'retail', status: 'running', api_state: 'needs_review' }], 'retail'), '기존 결과 확인 필요');
  assert.equal(registrationBlocked(p, [{ item_id: p.id, channel: 'retail', status: 'success', goods_no: '123' }], 'wholesale'), null);
  assert.equal(registrationBlocked(p, [{ item_id: p.id, channel: 'retail', status: 'success', goods_no: '123', api_state: 'deleted' }], 'retail'), null);
});

test('122/124 are leaves only when a fresh parent listing confirms the code still exists; other failures never become empty lists', async () => {
  for (const kind of ['categories','brands'] as const) for (const stillExists of [true, false]) {
    const h = harness(); h.children[''] = ['001']; h.children['001'] = [];
    let roots = 0;
    const client = {mall:'retail', codes:async (_kind:string,parent:string) => {
      if (parent) throw new GodomallError(422,'존재하지 않는 코드',kind==='brands'?'godomall_124':'godomall_122');
      roots++; return roots === 1 || stillExists ? [{code:'001',name:'분류',fields:{}}] : [];
    }} as unknown as GodomallClient;
    const result = await syncTaxonomy(h.db,client,kind,true);
    assert.equal(roots,2); assert.equal(result!.status,stillExists?'success':'failed'); assert.equal(h.published.length,stillExists?1:0);
  }
});
