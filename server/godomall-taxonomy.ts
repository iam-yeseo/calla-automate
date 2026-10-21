import type { Category, Channel, Settings } from '../src/types';
import type { MallCode } from '../src/godomall-types';
import type { GodomallClient } from './godomall-client';
import type { GodomallDb } from './godomall';
import { GodomallError } from './godomall-xml';

export type TaxonomyKind = 'categories' | 'brands';
export interface TaxonomySync {
  mall_id: Channel; kind: TaxonomyKind; status: 'syncing' | 'success' | 'failed';
  pending: string[]; visited: string[]; collected: Category[]; updated_at: string;
  synced_at: string | null; error_message: string | null;
}
export const syncSummary = (row: TaxonomySync | undefined) => row ? {
  mallId: row.mall_id, kind: row.kind, status: row.status, count: row.collected.length,
  remaining: row.pending.length, checked: row.visited.length, syncedAt: row.synced_at, error: row.error_message,
} : null;

// A short request advances a durable cursor. Partial or failed reads never replace
// the currently published settings; refreshing the page can resume the cursor.
export async function syncTaxonomy(db: GodomallDb, client: GodomallClient, kind: TaxonomyKind, restart: boolean) {
  const key = { mall_id: `eq.${client.mall}`, kind: `eq.${kind}` };
  const read = async (): Promise<TaxonomySync | undefined> => (await db('godomall_taxonomy_sync', { ...key, select: '*', limit: '1' })).data?.[0];
  let row = await read();
  if (!row) {
    const initial: TaxonomySync = { mall_id: client.mall, kind, status: 'syncing', pending: [''], visited: [], collected: [], updated_at: new Date().toISOString(), synced_at: null, error_message: null };
    await db('godomall_taxonomy_sync', { on_conflict: 'mall_id,kind' }, 'POST', initial, 'resolution=ignore-duplicates');
    row = (await read())!;
  } else if (restart && row.status !== 'syncing') {
    const updated = await db('godomall_taxonomy_sync', { ...key, updated_at: `eq.${row.updated_at}` }, 'PATCH', { status: 'syncing', pending: [''], visited: [], collected: [], error_message: null, updated_at: new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString() }, 'return=representation');
    row = updated.data?.[0] || (await read())!;
  }
  if (!row) throw new GodomallError(503, '업데이트 상태를 준비하지 못했습니다.', 'taxonomy_unavailable');
  if (row.status === 'success') return syncSummary(row);
  const next = structuredClone(row);
  next.status = 'syncing'; next.error_message = null;
  try {
    const confirmedParents = new Map<string, MallCode[]>();
    for (let step = 0; step < 4 && next.pending.length; step++) {
      const parent = next.pending[0];
      let codes: MallCode[];
      try { codes = await client.codes(kind, parent); }
      catch (error) {
        // Live Godomall returns 122 for leaf categories and 124 for leaf brands.
        // Only accept that as a leaf after a fresh parent listing proves it exists.
        if (!(error instanceof GodomallError) || error.code !== (kind === 'brands' ? 'godomall_124' : 'godomall_122') || !parent || !next.collected.some(row => row.code === parent)) throw error;
        const ancestor = parent.slice(0, -3);
        let siblings = confirmedParents.get(ancestor);
        if (!siblings) { siblings = await client.codes(kind, ancestor); confirmedParents.set(ancestor, siblings); }
        if (!siblings.some(row => row.code === parent)) throw new GodomallError(409, '조회 중 분류가 변경되었습니다. 업데이트를 처음부터 다시 실행해 주세요.', 'taxonomy_changed');
        codes = [];
      }
      for (const code of codes) {
        if (!/^(?:\d{3}){1,4}$/.test(code.code) || !code.name.trim()) throw new GodomallError(502, '분류 이름·코드 형식을 확인할 수 없습니다.', 'taxonomy_invalid');
        if (code.code === parent) continue; // Some installations also return the requested parent.
        if (!code.code.startsWith(parent) || code.code.length <= parent.length) throw new GodomallError(502, '분류 응답의 상위 코드가 일치하지 않습니다.', 'taxonomy_invalid');
        const item: Category = { code: code.code, name: code.name, parentCode: code.code.slice(0, -3), active: true, display: code.fields.cateDisplayFl, displayMobile: code.fields.cateDisplayMobileFl };
        const existing = next.collected.findIndex(x => x.code === code.code);
        if (existing >= 0) next.collected[existing] = item; else next.collected.push(item);
        if (code.code.length < 12 && !next.visited.includes(code.code) && !next.pending.includes(code.code)) next.pending.push(code.code);
      }
      next.pending.shift(); next.visited.push(parent);
      if (next.collected.length > 5000 || next.visited.length > 5001) throw new GodomallError(502, '분류 조회 범위를 초과했습니다. 기존 목록은 유지합니다.', 'taxonomy_limit');
    }
    if (!next.pending.length) {
      if (kind === 'categories' && !next.collected.length) throw new GodomallError(502, '카테고리 응답이 비어 있어 기존 목록을 유지합니다.', 'taxonomy_empty');
      const known = new Set(next.collected.map(x => x.code));
      if (next.collected.some(x => x.parentCode && !known.has(x.parentCode))) throw new GodomallError(502, '상위 분류가 누락되어 기존 목록을 유지합니다.', 'taxonomy_incomplete');
      next.collected.sort((a, b) => a.code.localeCompare(b.code));
      const { data } = await db('rpc/godomall_publish_taxonomy', {}, 'POST', { p_mall: client.mall, p_kind: kind, p_revision: row.updated_at, p_items: next.collected, p_visited: next.visited });
      return syncSummary(data as TaxonomySync);
    }
  } catch (e) {
    next.status = 'failed'; next.error_message = e instanceof GodomallError ? e.message : '분류를 업데이트하지 못했습니다. 기존 목록은 유지됩니다.';
  }
  next.updated_at = new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString();
  const saved = await db('godomall_taxonomy_sync', { ...key, updated_at: `eq.${row.updated_at}` }, 'PATCH', next, 'return=representation');
  return syncSummary(saved.data?.[0] || await read());
}

export function sameManagedTaxonomy(current: Settings, incoming: Settings): boolean {
  const stripFolder = (rows: Category[]) => rows.map(({ folder: _folder, ...row }) => row);
  return (['retail', 'wholesale'] as const).every(m => JSON.stringify(stripFolder(current.categories[m])) === JSON.stringify(stripFolder(incoming.categories[m])))
    && JSON.stringify(current.brands) === JSON.stringify(incoming.brands)
    && JSON.stringify(current.brandsByMall || {}) === JSON.stringify(incoming.brandsByMall || {})
    && JSON.stringify(current.taxonomySyncedAt || {}) === JSON.stringify(incoming.taxonomySyncedAt || {});
}
