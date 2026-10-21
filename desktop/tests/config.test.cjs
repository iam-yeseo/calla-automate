const { test } = require('node:test');
const assert = require('node:assert/strict');
const { trustedPage, externalURL, assetPath, WEB_ORIGIN } = require('../config.cjs');

test('only the packaged app origin receives native capabilities', () => {
  assert.equal(trustedPage('calla://app/edit/?list=1'), true);
  for (const url of ['https://app', 'calla://app.attacker.test/', 'calla://user@app/', 'file:///tmp/index.html', 'data:text/html,x', 'calla://app:8000/']) assert.equal(trustedPage(url), false, url);
  assert.equal(WEB_ORIGIN, 'https://cauto.yeseo.im');
});
test('external navigation rejects executables, local files and credential URLs', () => {
  for (const url of ['file:///etc/hosts', 'javascript:alert(1)', 'ftp://example.com', 'https://user:password@example.com', 'calla://app/']) assert.equal(externalURL(url), null);
  assert.equal(externalURL('https://cauto.yeseo.im/edit/?list=123'), 'https://cauto.yeseo.im/edit/?list=123');
});
test('asset resolver rejects traversal, encoded traversal and Windows separators', () => {
  assert.equal(assetPath('/app/dist', '/assets/app.js'), '/app/dist/assets/app.js');
  for (const pathname of ['/../secret', '/%2e%2e/secret', '/assets/%2e%2e/%2e%2e/secret', '/assets\\secret', '/%00', '/%E0%A4%A']) assert.equal(assetPath('/app/dist', pathname), null, pathname);
});
