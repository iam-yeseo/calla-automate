const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const config = require('../config.cjs');

const mainFile = path.resolve(__dirname, '../main.cjs');
const source = readFileSync(mainFile, 'utf8');
const authKey = `sb-${config.SUPABASE_PROJECT_REF}-auth-token`;

// Execute the real startup, protocol and IPC handlers without opening windows,
// using a real keychain, or sending requests to the production service.
async function launch({ storedJSON = '{}', upstream = () => new Response('{}') } = {}) {
  const handlers = new Map(), files = new Map(), writes = [], errors = [], requests = [];
  const authFile = '/fixture/userData/session.enc';
  files.set(authFile, Buffer.from(storedJSON));
  let startup, window, protocolHandler;
  const noop = () => {};
  const electron = {
    app: {
      isPackaged: false, setName: noop, setPath: noop, on: noop, quit: noop,
      requestSingleInstanceLock: () => true, getAppPath: () => '/fixture/app',
      getPath: name => '/fixture/' + name, getVersion: () => '0.6.3',
      whenReady: () => ({ then: callback => (startup = Promise.resolve().then(callback)) }),
    },
    BrowserWindow: class {
      constructor(options) {
        this.options = options;
        this.webContents = { mainFrame: { url: config.APP_ORIGIN + '/' }, on: noop, setWindowOpenHandler: noop };
        window = this;
      }
      on() {}
      once() {}
      async loadURL(url) { this.loadedURL = url; }
    },
    Tray: class { on() {} setToolTip() {} setContextMenu() {} },
    Menu: { buildFromTemplate: value => value, setApplicationMenu: noop },
    nativeImage: { createFromPath: () => ({ setTemplateImage: noop }) },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler), on: noop },
    protocol: { registerSchemesAsPrivileged: noop, handle: (_scheme, handler) => { protocolHandler = handler; } },
    session: { defaultSession: { setPermissionRequestHandler: noop, setPermissionCheckHandler: noop, on: noop } },
    safeStorage: { isEncryptionAvailable: () => true, decryptString: bytes => bytes.toString(), encryptString: value => Buffer.from(value) },
    dialog: { showErrorBox: (...args) => errors.push(args) },
    shell: {}, powerSaveBlocker: {}, clipboard: {},
  };
  const fs = {
    readFile: async filename => files.get(filename) || Buffer.from('<!doctype html>'),
    stat: async () => ({ isFile: () => true }),
    writeFile: async (filename, data, options) => { writes.push({ filename, options }); files.set(filename, data); },
    rename: async (from, to) => { files.set(to, files.get(from)); files.delete(from); },
  };
  vm.runInNewContext(source, {
    require: name => {
      if (name === 'electron') return electron;
      if (name === 'node:fs/promises') return fs;
      if (name === './config.cjs') return config;
      if (name === 'node:path') return path;
      throw new Error('Unexpected dependency: ' + name);
    },
    __dirname: path.dirname(mainFile),
    process: { env: { CALLA_DESKTOP_TEST: '1', CALLA_TEST_API_ORIGIN: 'http://127.0.0.1:32123' } },
    URL, Headers, Response, AbortSignal,
    fetch: async (url, options) => { requests.push({ url, ...options }); return upstream(url, options); },
  }, { filename: mainFile });
  await startup;
  assert.deepEqual(errors, []);
  assert.equal(window.loadedURL, config.APP_ORIGIN + '/');
  const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  return {
    request: protocolHandler, requests, writes, window,
    storage: (...args) => handlers.get('desktop:storage')(event, ...args),
    saved: () => JSON.parse(files.get(authFile).toString()),
  };
}

test('API proxy preserves retry timing while keeping both header allowlists narrow', async () => {
  for (const status of [429, 409]) {
    const app = await launch({ upstream: () => new Response('{"waiting":true}', {
      status, headers: { 'content-type': 'application/problem+json', 'retry-after': '17', 'cache-control': 'public', 'set-cookie': 'private=1', 'x-upstream-secret': 'private' },
    }) });
    const response = await app.request(new Request('calla://app/api/godomall/execute?step=1', {
      headers: { authorization: 'Bearer fixture', accept: 'application/json', 'content-type': 'application/json', cookie: 'renderer=1', origin: 'https://untrusted.test', 'x-untrusted': '1' },
    }));
    assert.equal(response.status, status);
    assert.equal(await response.text(), '{"waiting":true}');
    assert.deepEqual(Object.fromEntries(response.headers), { 'cache-control': 'no-store', 'content-type': 'application/problem+json', 'retry-after': '17' });
    assert.equal(app.requests.length, 1);
    assert.equal(app.requests[0].url, 'http://127.0.0.1:32123/api/godomall/execute?step=1');
    assert.equal(app.requests[0].redirect, 'error');
    assert.deepEqual(Object.fromEntries(app.requests[0].headers), { accept: 'application/json', authorization: 'Bearer fixture', 'content-type': 'application/json', origin: 'http://127.0.0.1:32123' });
  }
});

test('API proxy does not invent a retry header when the upstream omits one', async () => {
  const app = await launch();
  const response = await app.request(new Request('calla://app/api/me'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('retry-after'), null);
});

test('declared oversized or invalid API bodies are rejected before buffering or fetching', async () => {
  const app = await launch();
  for (const length of [String(20 * 1024 * 1024 + 1), '-1', 'invalid']) {
    const response = await app.request({
      url: 'calla://app/api/upload', method: 'POST', headers: new Headers({ 'content-length': length }),
      arrayBuffer: async () => { assert.fail('body must not be consumed'); },
    });
    assert.equal(response.status, 413);
  }
  assert.equal(app.requests.length, 0);
});

test('actual body size is still checked when content-length is missing or understated', async () => {
  const app = await launch();
  for (const headers of [{}, { 'content-length': '1' }]) {
    const response = await app.request({
      url: 'calla://app/api/upload', method: 'POST', headers: new Headers(headers),
      arrayBuffer: async () => new ArrayBuffer(20 * 1024 * 1024 + 1),
    });
    assert.equal(response.status, 413);
  }
  assert.equal(app.requests.length, 0);
});

test('a body at the declared size limit remains accepted', async () => {
  const app = await launch();
  const body = new ArrayBuffer(20 * 1024 * 1024);
  const response = await app.request({
    url: 'calla://app/api/upload', method: 'POST', headers: new Headers({ 'content-length': String(body.byteLength) }),
    arrayBuffer: async () => body,
  });
  assert.equal(response.status, 200);
  assert.equal(app.requests[0].body, body);
});

test('valid non-object saved JSON permits startup and later session writes', async () => {
  for (const value of ['x', [], [1], 42, true, null]) {
    const app = await launch({ storedJSON: JSON.stringify(value) });
    assert.equal(await app.storage('get', authKey), null);
    await app.storage('set', authKey, 'new-session');
    assert.equal(await app.storage('get', authKey), 'new-session');
    assert.deepEqual(app.saved(), { [authKey]: 'new-session' });
    assert.equal(app.writes[0].options.mode, 0o600);
  }
});

test('existing object sessions survive startup and subsequent session writes', async () => {
  const verifierKey = authKey + '-code-verifier';
  const app = await launch({ storedJSON: JSON.stringify({ [authKey]: 'existing', [verifierKey]: 'verifier' }) });
  assert.equal(await app.storage('get', authKey), 'existing');
  await app.storage('set', authKey, 'updated');
  assert.deepEqual(app.saved(), { [authKey]: 'updated', [verifierKey]: 'verifier' });
});

test('packaged CSP only connects to this project and preserves renderer isolation', async () => {
  const app = await launch();
  const response = await app.request(new Request('calla://app/'));
  const connect = response.headers.get('content-security-policy').split('; ').find(value => value.startsWith('connect-src '));
  assert.equal(connect, `connect-src 'self' https://${config.SUPABASE_PROJECT_REF}.supabase.co wss://${config.SUPABASE_PROJECT_REF}.supabase.co`);
  assert.equal(app.window.options.webPreferences.contextIsolation, true);
  assert.equal(app.window.options.webPreferences.sandbox, true);
  assert.equal(app.window.options.webPreferences.nodeIntegration, false);
});

test('session storage accepts exactly the three project auth keys', async () => {
  const app = await launch();
  for (const key of [authKey, authKey + '-code-verifier', authKey + '-user']) {
    await app.storage('set', key, 'fixture');
    assert.equal(await app.storage('get', key), 'fixture');
    await app.storage('remove', key);
    assert.equal(await app.storage('get', key), null);
  }
  for (const key of ['sb-otherproject-auth-token', 'prefix-' + authKey, authKey + '-extra', authKey + '-code-verifier-user', '__proto__', 42, null]) {
    await assert.rejects(app.storage('set', key, 'fixture'), /허용되지 않는 로그인 저장 항목/);
  }
  assert.deepEqual(app.saved(), {});
});
