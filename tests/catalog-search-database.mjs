// External test-only PGlite install; this does not contact a remote database.
// node --import tsx tests/catalog-search-database.mjs /absolute/path/to/@electric-sql/pglite/dist/index.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createWorker } from '../server/index.ts';

assert.ok(process.argv[2] && isAbsolute(process.argv[2]), 'Pass the absolute PGlite module path');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const database = new PGlite();
const env = {
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'fixture-public',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', ADMIN_EMAILS: '',
};

async function catalogPatterns(q) {
  let filter, catalogCalls = 0;
  const worker = createWorker({ fetch: async (input, init) => {
    const url = new URL(String(input));
    assert.equal(init.method || 'GET', 'GET');
    if (url.pathname === '/auth/v1/user') return Response.json({
      id: '33333333-3333-4333-8333-333333333333',
      email: 'fixture@example.test', app_metadata: { calla_role: 'viewer' },
    });
    assert.equal(url.pathname, '/rest/v1/product_items');
    catalogCalls++;
    filter = url.searchParams.get('or');
    return Response.json([]);
  } });
  const response = await worker.fetch(new Request(`https://calla.test/api/catalog?${new URLSearchParams({ q })}`, {
    headers: { authorization: 'Bearer fixture-user' },
  }), env);
  assert.equal(response.status, 200, await response.text());
  assert.equal(catalogCalls, 1);
  assert.equal(typeof filter, 'string');

  // PostgREST pQuotedValue consumes a backslash and the following character;
  // SqlFragment maps each '*' to '%' for ILIKE. Reproduce only those transport
  // transformations, then let actual PostgreSQL evaluate pattern semantics.
  // https://github.com/PostgREST/postgrest/blob/v13.0.4/src/PostgREST/ApiRequest/QueryParams.hs#L647-L650
  // https://github.com/PostgREST/postgrest/blob/v13.0.4/src/PostgREST/Query/SqlFragment.hs#L355-L357
  let offset = 0;
  const consume = expected => {
    assert.equal(filter.slice(offset, offset + expected.length), expected, filter);
    offset += expected.length;
  };
  consume('(');
  const patterns = [];
  for (const [index, column] of ['brand', 'model', 'name_own'].entries()) {
    consume(`${column}.ilike."`);
    let value = '';
    while (offset < filter.length && filter[offset] !== '"') {
      if (filter[offset] === '\\') {
        offset++;
        assert.ok(offset < filter.length, 'quoted escape needs a following character');
      }
      value += filter[offset++];
    }
    consume('"');
    consume(index === 2 ? ')' : ',');
    patterns.push(value.replace(/\*/g, '%'));
  }
  assert.equal(offset, filter.length, 'unexpected predicate outside the three quoted values');
  assert.deepEqual(patterns, Array(3).fill(patterns[0]));
  return patterns;
}

async function expectMatches(q, matching, nonmatching) {
  const patterns = await catalogPatterns(q);
  const { rows } = await database.query(`
    select model from jsonb_array_elements_text($1::jsonb) with ordinality as candidate(model, position)
    where model ilike $2 order by position`, [JSON.stringify([...matching, ...nonmatching]), patterns[1]]);
  assert.deepEqual(rows.map(row => row.model), matching, q);
}

try {
  await test('catalog SQL preserves decimal model punctuation and case-insensitive substring matching', async () => {
    await expectMatches('MODEL-1.0', ['MODEL-1.0', 'rack model-1.0 rev2'], ['MODEL-10', 'MODEL-1x0', 'MODEL-1 0']);
    await expectMatches('model, variant (2)', ['MODEL, variant (2)', 'rack model, variant (2) rev'], ['model variant 2', 'model, variant (3)']);
  });

  await test('catalog SQL preserves a terminal backslash without consuming the trailing wildcard', async () => {
    await expectMatches('MODEL\\', ['MODEL\\', 'rack model\\ rev2'], ['MODEL%', 'MODEL', 'MODEL-1.0']);
  });

  await test('catalog SQL matches embedded literal backslashes instead of dropping them', async () => {
    await expectMatches('A\\B', ['A\\B', 'rack a\\b rev2'], ['AB', 'A B', 'A\\\\B']);
  });

  await test('catalog SQL preserves literal quotes inside quoted PostgREST operands', async () => {
    await expectMatches('Model "B"', ['Model "B"', 'rack MODEL "b" rev2'], ['Model B', 'Model C', 'Model \\"B\\"']);
  });

  await test('catalog SQL treats filter injection punctuation and escapes as literal model text', async () => {
    for (const q of ['x,model.eq.secret)', 'x"),or(model.eq.secret', 'x\\"),model.eq.secret', '.eq.(anything)']) {
      await expectMatches(q, [q, 'rack ' + q + ' rev2'], ['secret', 'anything', 'x', 'unrelated']);
    }
  });

  await test('catalog SQL does not interpret user percent, underscore or star as wildcards', async () => {
    for (const wildcard of ['%', '_', '*']) {
      await expectMatches('A' + wildcard + 'B', ['A B', 'rack a b rev2'], ['AB', 'AxB', 'AanythingB']);
    }
  });
} finally {
  await database.close();
}
