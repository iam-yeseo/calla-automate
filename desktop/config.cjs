const path = require('node:path');

const WEB_ORIGIN = 'https://cauto.yeseo.im';
const APP_ORIGIN = 'calla://app';
// wrangler.jsonc의 SUPABASE_URL과 일치해야 함.
const SUPABASE_PROJECT_REF = 'giuqapykceosroauaijq';

function trustedPage(value) {
  try { const url = new URL(value); return url.protocol === 'calla:' && url.host === 'app' && !url.username && !url.password; }
  catch { return false; }
}
function externalURL(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
function assetPath(root, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').includes('..')) return null;
  const target = path.resolve(root, '.' + decoded);
  return target.startsWith(path.resolve(root) + path.sep) ? target : null;
}
module.exports = { WEB_ORIGIN, APP_ORIGIN, SUPABASE_PROJECT_REF, trustedPage, externalURL, assetPath };
