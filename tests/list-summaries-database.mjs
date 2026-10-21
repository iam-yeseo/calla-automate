// Run with an external test-only PGlite install; no project dependency or remote DB.
// node tests/list-summaries-database.mjs /absolute/path/to/@electric-sql/pglite/dist/index.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

assert.ok(process.argv[2] && isAbsolute(process.argv[2]), 'Pass the absolute PGlite module path');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const database = new PGlite();
const LIST = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const EMPTY = '44444444-4444-4444-8444-444444444444';
const MATRIX = '55555555-5555-4555-8555-555555555555';
const keys = ['total', 'doneCount', 'retailSuccess', 'wholesaleSuccess', 'retailTotal', 'wholesaleTotal', 'runningCount', 'failedCount'];
const summary = value => Object.fromEntries(keys.map(key => [key, value[key]]));
const zero = Object.fromEntries(keys.map(key => [key, 0]));
const summaries = async () => (await database.query('select public.product_list_summaries() as lists')).rows[0].lists;

try {
  await database.exec(await readFile(new URL('./list-summaries-database.sql', import.meta.url), 'utf8'));
  await database.exec(await readFile(new URL('../supabase/migrations/20261019000000_product_list_summaries.sql', import.meta.url), 'utf8'));

  await test('list summary SQL returns an empty array for an empty workspace', async () => {
    assert.deepEqual(await summaries(), []);
  });

  await test('list summary SQL preserves the original server fixture counts exactly', async () => {
    await database.query(`insert into public.product_lists (id, title, author, work_date, note, created_at) values
      ($1, '기존 리스트', '관리자', '2026-09-30', '메모', '2026-10-19T00:00:00Z'),
      ($2, '빈 리스트', '관리자', '2026-09-30', '', '2026-10-18T00:00:00Z')`, [LIST, EMPTY]);
    await database.query(`insert into public.product_items (id, list_id, done, need_retail, need_wholesale) values
      ($1, $3, true, '필요', '불필요'), ($2, $3, false, '필요', '필요')`, [ITEM, USER, LIST]);
    await database.query(`insert into public.product_registrations (item_id, channel, status) values
      ($1, 'wholesale', 'success'), ($2, 'retail', 'running'), ($2, 'wholesale', 'failed')`, [ITEM, USER]);
    const lists = await summaries();
    assert.deepEqual(summary(lists[0]), { total: 2, doneCount: 1, retailSuccess: 0, wholesaleSuccess: 0, retailTotal: 2, wholesaleTotal: 1, runningCount: 1, failedCount: 1 });
    assert.deepEqual(summary(lists[1]), zero);
  });

  await test('list summary SQL preserves metadata and descending creation order', async () => {
    const lists = await summaries();
    const source = (await database.query('select to_jsonb(l) as value from public.product_lists l order by created_at desc')).rows.map(row => row.value);
    assert.deepEqual(lists.map(list => list.id), [LIST, EMPTY]);
    assert.deepEqual(lists.map(list => Object.fromEntries(Object.keys(source[0]).map(key => [key, list[key]]))), source);
  });

  await test('list summary SQL counts required successes and all running/failed channels without join inflation', async () => {
    await database.query(`insert into public.product_lists (id, title, created_at) values ($1, '채널 상태 표', '2026-10-17T00:00:00Z')`, [MATRIX]);
    const states = [
      [true, '필요', '필요', 'success', 'success'],
      [false, '불필요', '불필요', 'success', 'success'],
      [false, '불필요', '불필요', 'running', 'failed'],
      [false, '필요', '불필요', 'pending', 'running'],
    ];
    for (const [index, [done, retail, wholesale, retailStatus, wholesaleStatus]] of states.entries()) {
      const id = `66666666-6666-4666-8666-${String(index + 1).padStart(12, '0')}`;
      await database.query('insert into public.product_items (id, list_id, done, need_retail, need_wholesale) values ($1, $2, $3, $4, $5)', [id, MATRIX, done, retail, wholesale]);
      await database.query("insert into public.product_registrations (item_id, channel, status) values ($1, 'retail', $2), ($1, 'wholesale', $3)", [id, retailStatus, wholesaleStatus]);
    }
    const lists = await summaries();
    assert.deepEqual(summary(lists.find(list => list.id === MATRIX)), { total: 4, doneCount: 1, retailSuccess: 1, wholesaleSuccess: 1, retailTotal: 2, wholesaleTotal: 1, runningCount: 2, failedCount: 1 });
    assert.deepEqual(summary(lists.find(list => list.id === LIST)), { total: 2, doneCount: 1, retailSuccess: 0, wholesaleSuccess: 0, retailTotal: 2, wholesaleTotal: 1, runningCount: 1, failedCount: 1 });
  });

  await test('list summary SQL returns over 1000 lists in a single scalar result', async () => {
    await database.exec(`insert into public.product_lists (id, title, created_at)
      select ('77777777-7777-4777-8777-' || lpad(n::text, 12, '0'))::uuid, 'bulk-' || n,
        '2026-10-20T00:00:00Z'::timestamptz + n * interval '1 second'
      from generate_series(1, 1001) n`);
    const result = await database.query('select public.product_list_summaries() as lists');
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].lists.length, 1004);
    assert.equal(new Set(result.rows[0].lists.map(list => list.id)).size, 1004);
    assert.equal(result.rows[0].lists[0].title, 'bulk-1001');
    assert.equal(result.rows[0].lists[1000].title, 'bulk-1');
    assert.ok(result.rows[0].lists.slice(0, 1001).every(list => JSON.stringify(summary(list)) === JSON.stringify(zero)));
    const [{ scalar }] = (await database.query("select not proretset and prorettype = 'jsonb'::regtype as scalar from pg_proc where oid = 'public.product_list_summaries()'::regprocedure")).rows;
    assert.equal(scalar, true);
  });

  await test('list summary SQL execution is limited to service_role with invoker security', async () => {
    for (const role of ['unprivileged', 'anon', 'authenticated']) {
      const [{ allowed }] = (await database.query("select has_function_privilege($1, 'public.product_list_summaries()', 'EXECUTE') as allowed", [role])).rows;
      assert.equal(allowed, false, role);
      await database.exec(`set role ${role}`);
      try { await assert.rejects(summaries(), { code: '42501' }); }
      finally { await database.exec('reset role'); }
    }
    const [{ definer, publicExecute }] = (await database.query(`select p.prosecdef as definer,
      exists(select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as "publicExecute"
      from pg_proc p where p.oid = 'public.product_list_summaries()'::regprocedure`)).rows;
    assert.equal(definer, false);
    assert.equal(publicExecute, false);
    await database.exec('set role service_role');
    try { assert.equal((await summaries()).length, 1004); }
    finally { await database.exec('reset role'); }
  });
} finally {
  await database.close();
}
