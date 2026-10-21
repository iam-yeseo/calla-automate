const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, protocol, shell, dialog, session, safeStorage, powerSaveBlocker, clipboard } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { WEB_ORIGIN, APP_ORIGIN, SUPABASE_PROJECT_REF, trustedPage, externalURL, assetPath } = require('./config.cjs');
const authStorageKey = new RegExp(`^sb-${SUPABASE_PROJECT_REF}-auth-token(?:-code-verifier|-user)?$`);

protocol.registerSchemesAsPrivileged([{ scheme: 'calla', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
app.setName('CALLA');
const testing = !app.isPackaged && process.env.CALLA_DESKTOP_TEST === '1';
const testOrigin = process.env.CALLA_TEST_API_ORIGIN || '';
const apiOrigin = testing && /^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(testOrigin) ? testOrigin : WEB_ORIGIN;
if (testing && process.env.CALLA_TEST_USER_DATA) app.setPath('userData', process.env.CALLA_TEST_USER_DATA);
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  let window, tray, quitting = false, quitPending = false, blocker;
  let draft = { dirty: false, busy: false }, storedAuth = {}, authWrite = Promise.resolve();
  const assets = path.join(__dirname, 'assets');
  const dist = path.join(app.getAppPath(), 'dist');
  const authFile = () => path.join(app.getPath('userData'), 'session.enc');
  const trusted = event => event.sender === window?.webContents && event.senderFrame === window.webContents.mainFrame && trustedPage(event.senderFrame.url);
  function requireTrusted(event) { if (!trusted(event)) throw new Error('허용되지 않은 앱 요청입니다.'); }
  function show() { if (!window || window.isDestroyed()) return; app.dock?.show(); window.show(); window.focus(); }
  function command(value) { show(); window.webContents.send('desktop:command', value); }
  async function openExternal(value) { const url = externalURL(value); if (url) await shell.openExternal(url); }
  function updateTray() {
    if (!tray) return;
    const label = draft.busy ? 'API 작업 처리 중' : '고도몰 API 사용';
    tray.setToolTip(`CALLA · ${label}`);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'CALLA 열기', click: show },
      { label, enabled: false },
      { type: 'separator' },
      { label: '자동 상품 등록', click: () => command('automation') },
      { label: '동기화 설정', click: () => command('sync') },
      { label: '웹 버전 열기', click: () => openExternal(WEB_ORIGIN) },
      { type: 'separator' },
      { label: 'CALLA 종료', click: () => void requestQuit() },
    ]));
    if (draft.busy && blocker === undefined) blocker = powerSaveBlocker.start('prevent-app-suspension');
    else if (!draft.busy && blocker !== undefined) { powerSaveBlocker.stop(blocker); blocker = undefined; }
  }
  async function requestQuit() {
    if (quitting || quitPending) return;
    quitPending = true;
    try {
      if (draft.busy) { show(); await dialog.showMessageBox(window, { type: 'info', message: '작업을 처리 중입니다.', detail: '현재 API 요청과 결과 확인이 끝난 후 종료해 주세요.', buttons: ['확인'] }); return; }
      const modalOpen = window && !window.isDestroyed() && await window.webContents.executeJavaScript("Boolean(document.querySelector('dialog[open]'))").catch(() => false);
      if (draft.dirty || modalOpen) {
        show();
        const choice = await dialog.showMessageBox(window, {
          type: 'question', message: '열려 있는 작업을 닫고 종료할까요?',
          detail: '저장하지 않은 변경사항은 사라집니다. 실행한 API 작업은 상품 조회의 작업 이력에서 다시 확인할 수 있습니다.',
          buttons: ['계속 사용', '종료'], defaultId: 0, cancelId: 0,
        });
        if (choice.response !== 1) return;
      }
      await authWrite;
      quitting = true;
      if (blocker !== undefined) powerSaveBlocker.stop(blocker);
      window?.destroy(); tray?.destroy(); app.quit();
    } finally { quitPending = false; }
  }
  async function handleRequest(request) {
    const url = new URL(request.url);
    if (!trustedPage(url.href)) return new Response('Forbidden', { status: 403 });
    if (url.pathname.startsWith('/api/')) {
      const headers = new Headers();
      for (const name of ['authorization', 'content-type', 'accept']) if (request.headers.has(name)) headers.set(name, request.headers.get(name));
      try {
        const declared = request.headers.get('content-length');
        if (declared && (!/^\d+$/.test(declared) || Number(declared) > 20 * 1024 * 1024)) return Response.json({ error: '파일이 너무 큽니다.' }, { status: 413 });
        const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
        if (body?.byteLength > 20 * 1024 * 1024) return Response.json({ error: '파일이 너무 큽니다.' }, { status: 413 });
        headers.set('Origin', apiOrigin);
        const response = await fetch(apiOrigin + url.pathname + url.search, { method: request.method, headers, body, redirect: 'error', signal: AbortSignal.timeout(60000) });
        const responseHeaders = new Headers({ 'Content-Type': response.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' });
        if (response.headers.has('retry-after')) responseHeaders.set('Retry-After', response.headers.get('retry-after'));
        return new Response(response.body, { status: response.status, headers: responseHeaders });
      } catch { return Response.json({ error: '웹 서버에 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.' }, { status: 502 }); }
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    let filename = assetPath(dist, url.pathname === '/' ? '/index.html' : url.pathname);
    if (!filename) return new Response('Forbidden', { status: 403 });
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.ico': 'image/x-icon' };
    try {
      if (!(await fs.stat(filename).catch(() => null))?.isFile()) {
        if (path.extname(filename)) return new Response('Not found', { status: 404 });
        filename = path.join(dist, 'index.html');
      }
      const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' https://${SUPABASE_PROJECT_REF}.supabase.co wss://${SUPABASE_PROJECT_REF}.supabase.co; frame-src 'self' blob:; object-src 'none'; base-uri 'none'`;
      return new Response(await fs.readFile(filename), { headers: { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' } });
    } catch { return new Response('앱 파일을 읽지 못했습니다.', { status: 500 }); }
  }
  app.on('second-instance', show);
  app.on('activate', show);
  app.on('window-all-closed', () => {});
  app.on('before-quit', event => { if (!quitting) { event.preventDefault(); void requestQuit(); } });
  app.whenReady().then(async () => {
    protocol.handle('calla', handleRequest);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.on('will-download', (_event, item) => { item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) }); });
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const parsed = JSON.parse(safeStorage.decryptString(await fs.readFile(authFile())));
        storedAuth = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch { storedAuth = {}; }
    }
    window = new BrowserWindow({
      title: 'CALLA', width: 1440, height: 960, minWidth: 1040, minHeight: 700, show: false,
      backgroundColor: '#f7f8fa', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 10 },
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, backgroundThrottling: false, spellcheck: false, devTools: !app.isPackaged },
    });
    window.once('ready-to-show', show);
    window.on('close', event => { if (!quitting) { event.preventDefault(); window.hide(); } });
    window.webContents.setWindowOpenHandler(({ url }) => { void openExternal(trustedPage(url) ? WEB_ORIGIN + new URL(url).pathname + new URL(url).search : url); return { action: 'deny' }; });
    window.webContents.on('will-navigate', (event, url) => { if (!trustedPage(url)) { event.preventDefault(); void openExternal(url); } });
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.on('app-command', (_event, action) => {
      if (action === 'browser-backward') command('back');
      else if (action === 'browser-forward') command('forward');
    });
    const trayImage = nativeImage.createFromPath(path.join(assets, 'trayTemplate.png')); trayImage.setTemplateImage(true);
    tray = new Tray(trayImage); tray.on('click', show); updateTray();
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'CALLA', submenu: [{ role: 'about', label: 'CALLA 정보' }, { type: 'separator' }, { label: '동기화 설정…', accelerator: 'Cmd+,', click: () => command('sync') }, { type: 'separator' }, { role: 'hide', label: 'CALLA 가리기' }, { role: 'hideOthers', label: '다른 앱 가리기' }, { role: 'unhide', label: '모두 보기' }, { type: 'separator' }, { label: 'CALLA 종료', accelerator: 'Cmd+Q', click: () => void requestQuit() }] },
      { label: '파일', submenu: [{ label: '저장', accelerator: 'Cmd+S', click: () => command('save') }, { label: '웹 버전 열기', click: () => openExternal(WEB_ORIGIN) }, { type: 'separator' }, { role: 'close', label: '창 닫기' }] },
      { label: '편집', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: '보기', submenu: [{ label: '뒤로', accelerator: 'CmdOrCtrl+[', click: () => command('back') }, { label: '앞으로', accelerator: 'CmdOrCtrl+]', click: () => command('forward') }, { type: 'separator' }, { label: '최신 데이터 불러오기', accelerator: 'Cmd+R', click: () => command('refresh') }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
      { label: '윈도우', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { label: 'CALLA 열기', click: show }] },
    ]));
    ipcMain.handle('desktop:state', event => { requireTrusted(event); return { phase: 'ready', message: '고도몰 API 사용', version: app.getVersion(), webOrigin: WEB_ORIGIN, encryptedSession: safeStorage.isEncryptionAvailable() }; });
    ipcMain.handle('desktop:open-web', event => { requireTrusted(event); return openExternal(WEB_ORIGIN); });
    ipcMain.handle('desktop:copy', (event, value) => { requireTrusted(event); if (typeof value !== 'string' || value.length > 2000000) throw new Error('복사할 내용을 확인해 주세요.'); clipboard.writeText(value); });
    ipcMain.on('desktop:draft', (event, value) => { if (trusted(event) && value && typeof value === 'object') { draft = { dirty: value.dirty === true, busy: value.busy === true }; updateTray(); } });
    ipcMain.handle('desktop:storage', async (event, operation, key, value) => {
      requireTrusted(event);
      if (typeof key !== 'string' || !authStorageKey.test(key)) throw new Error('허용되지 않는 로그인 저장 항목입니다.');
      if (operation === 'get') return storedAuth[key] ?? null;
      if (operation === 'set' && typeof value === 'string' && value.length <= 50000) storedAuth[key] = value;
      else if (operation === 'remove') delete storedAuth[key];
      else throw new Error('허용되지 않는 로그인 저장 요청입니다.');
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(JSON.stringify(storedAuth));
        authWrite = authWrite.catch(() => {}).then(async () => { const tmp = authFile() + '.tmp'; await fs.writeFile(tmp, encrypted, { mode: 0o600 }); await fs.rename(tmp, authFile()); });
        await authWrite;
      }
    });
    await window.loadURL(APP_ORIGIN + '/');
  }).catch(error => { dialog.showErrorBox('CALLA를 열지 못했습니다.', error.message); quitting = true; app.quit(); });
}
