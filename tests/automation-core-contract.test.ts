import test from 'node:test';
import assert from 'node:assert/strict';
import core from '../src/lib/automation-core.js';

// This exhaustive table is checked against the declarations by tsc and against
// the real JavaScript exports below, so either side drifting fails validation.
type RuntimeTypes<T> = {
  [Key in keyof T]: T[Key] extends (...args: never[]) => unknown ? 'function'
    : T[Key] extends string ? 'string' : T[Key] extends unknown[] ? 'object' : never;
};
const declaredTypes = {
  BASE: 'string', EXTENSIONS: 'object',
  clone: 'function', slug: 'function', brandKey: 'function', hangulInitials: 'function',
  brandSearchText: 'function', brandMatches: 'function', matchBrand: 'function',
  normalizeSettings: 'function', normalizeOrigin: 'function', originCountry: 'function',
  originIssue: 'function', wholesaleRegularPrice: 'function', normalize: 'function',
  path: 'function', defaultFolder: 'function', imageUrl: 'function',
  imageLinkUrl: 'function', imageLinkIssue: 'function', generate: 'function',
  generatorValues: 'function', displayName: 'function', namePrefix: 'function', withNamePrefix: 'function', hasMarkup: 'function',
  smartName: 'function', smartNameInput: 'function', html: 'function',
  detailBlocks: 'function', detailHtml: 'function', withDetailBlocks: 'function',
  stockIssue: 'function', validation: 'function', readyIssues: 'function',
  exportItem: 'function', validateSettings: 'function',
} satisfies RuntimeTypes<typeof core>;

test('automation-core runtime exports match the declared keys and value types', () => {
  assert.deepEqual(Object.keys(core).sort(), Object.keys(declaredTypes).sort());
  for (const key of Object.keys(declaredTypes) as (keyof typeof core)[]) {
    assert.equal(typeof core[key], declaredTypes[key], key);
  }
  assert.ok(Array.isArray(core.EXTENSIONS));
  assert.ok(core.EXTENSIONS.every(extension => typeof extension === 'string'));
});
