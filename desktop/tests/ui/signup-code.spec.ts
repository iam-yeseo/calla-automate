import { test, expect, chromium, _electron as electron, type Browser, type ElectronApplication, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startFixture } from './fixture';

for (const surface of ['web', 'desktop'] as const) test(`${surface}: signup requires a code and submits one pending account request`, async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'calla-signup-code-'));
  const submissions: unknown[] = [], errors: string[] = [];
  let signupRequests = 0, releaseSignup = () => {};
  const signupResponse = new Promise<void>(resolve => { releaseSignup = resolve; });
  const fixture = await startFixture({ respond: (route, method, body) => {
    if (route === '/auth/signup' && method === 'POST') {
      submissions.push(JSON.parse(body));
      return { username: 'fixture-new-user', status: 'pending' };
    }
  } });
  const web = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://local'), pathname = url.pathname;
    // Electron's calla:// protocol is not visible to Playwright request routing.
    // Gate both surfaces at the local HTTP boundary, before forwarding to the fixture.
    if (pathname.startsWith('/api/')) {
      try {
        let body = ''; for await (const chunk of request) body += chunk;
        if (pathname === '/api/auth/signup') { signupRequests++; await signupResponse; }
        const headers = new Headers();
        for (const name of ['authorization', 'content-type']) {
          const value = request.headers[name]; if (typeof value === 'string') headers.set(name, value);
        }
        const upstream = await fetch(fixture.origin + pathname + url.search, { method: request.method, headers, body: body || undefined, redirect: 'error' });
        response.statusCode = upstream.status;
        response.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
        response.end(Buffer.from(await upstream.arrayBuffer()));
      } catch { response.statusCode = 502; response.end(); }
      return;
    }
    const file = pathname.startsWith('/assets/') ? path.resolve('dist', pathname.slice(1)) : path.resolve('dist/index.html');
    try {
      const data = await readFile(file);
      response.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.woff2') ? 'font/woff2' : 'text/html');
      response.end(data);
    } catch { response.statusCode = 404; response.end(); }
  });
  let browser: Browser | undefined, app: ElectronApplication | undefined, page: Page;
  try {
    await new Promise<void>(resolve => web.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(web.address() as { port: number }).port}`;
    if (surface === 'desktop') {
      app = await electron.launch({ args: ['.'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', CALLA_DESKTOP_TEST: '1', CALLA_TEST_USER_DATA: userData, CALLA_TEST_API_ORIGIN: origin } });
      page = await app.firstWindow();
    } else {
      browser = await chromium.launch({ channel: 'chrome' });
      page = await browser.newPage();
    }
    page.on('pageerror', error => errors.push(error.message));
    // All API writes go to the local fixture; unrelated external requests are blocked.
    await page.route('https://**', route => route.abort());
    if (surface === 'web') await page.goto(origin);
    await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible();
    await expect(page.getByLabel('가입 코드', { exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: '최초 관리자 계정 설정', exact: true }).click();
    await expect(page.getByLabel('초기 설정 토큰', { exact: true })).toBeVisible();
    await expect(page.getByLabel('가입 코드', { exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: '로그인으로 돌아가기', exact: true }).click();
    await page.getByRole('link', { name: '회원가입', exact: true }).click();
    await page.getByLabel('이름', { exact: true }).fill('가입 검증');
    await page.getByLabel('아이디', { exact: true }).fill('fixture-new-user');
    await page.getByLabel('비밀번호', { exact: true }).fill('fixture-password');
    await page.getByLabel('비밀번호 확인', { exact: true }).fill('fixture-password');
    const code = page.getByLabel('가입 코드', { exact: true });
    await expect(code).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: '가입 신청', exact: true }).click();
    await expect(code).toBeFocused();
    expect(await code.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
    expect(signupRequests).toBe(0);
    expect(submissions).toEqual([]);

    await code.fill('  fixture-signup-code  ');
    await page.getByRole('button', { name: '가입 신청', exact: true }).click();
    await expect.poll(() => signupRequests).toBe(1);
    await expect(page.getByRole('button', { name: '처리 중…', exact: true })).toBeDisabled();
    await expect(code).toBeDisabled();
    releaseSignup();
    await expect(page.getByRole('heading', { name: '관리자 승인을 기다리고 있습니다', exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('승인 대기');
    await expect(page.getByRole('status')).toContainText('fixture-new-user');
    expect(submissions).toEqual([{ username: 'fixture-new-user', name: '가입 검증', password: 'fixture-password', signupCode: 'fixture-signup-code' }]);
    expect(fixture.calls.filter(call => call.method !== 'GET')).toEqual([{ path: '/auth/signup', method: 'POST' }]);
    expect(errors).toEqual([]);
  } finally {
    releaseSignup();
    if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    if (browser) await browser.close();
    if (web.listening) await new Promise<void>(resolve => web.close(() => resolve()));
    await fixture.close();
    await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
