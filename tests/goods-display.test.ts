import assert from 'node:assert/strict';
import test from 'node:test';
import { goodsRegularPrice, goodsStock } from '../src/goods-display';

test('unlimited stock with a stored zero remains available unless explicitly sold out', () => {
  assert.deepEqual(goodsStock({ stockMode: 'n', stock: 0, soldOut: 'n' }), { unlimited: true, soldOut: false });
  assert.deepEqual(goodsStock({ stockMode: 'n', stock: 0, soldOut: 'y' }), { unlimited: true, soldOut: true });
  assert.deepEqual(goodsStock({ stockMode: 'y', stock: 0, soldOut: 'n' }), { unlimited: false, soldOut: true });
  assert.deepEqual(goodsStock({ stockMode: 'y', stock: 12, soldOut: 'n' }), { unlimited: false, soldOut: false });
  assert.deepEqual(goodsStock({ stockMode: null, stock: null, soldOut: null }), { unlimited: false, soldOut: false });
});

test('missing or malformed remote regular prices are not silently shown as zero', () => {
  assert.equal(goodsRegularPrice({ fields: { fixedPrice: '1500' } }), 1500);
  assert.equal(goodsRegularPrice({ fields: { fixedPrice: '0' } }), 0);
  for (const fields of [{}, { fixedPrice: '' }, { fixedPrice: ' ' }, { fixedPrice: 'unknown' }] as Record<string, string>[]) assert.equal(goodsRegularPrice({ fields }), null);
});
