import { test, expect, chromium, _electron as electron, type Browser, type ElectronApplication, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startFixture, AUTH_URL, AUTH_USER, TOKEN } from './fixture';
import { chooseOption } from './select-control';

for (const surface of ['web', 'desktop'] as const) test(`${surface}: completed channel registrations update list badges and completion filters without manual done flags`, async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'calla-list-completion-'));
  const completed = { total: 6, doneCount: 0, retailTotal: 6, wholesaleTotal: 6, retailSuccess: 6, wholesaleSuccess: 6, runningCount: 0, failedCount: 0 };
  const lists = [
    { ...completed, title: '채널 등록 완료 리스트', expectedStatus: '작업 완료' },
    { ...completed, title: '도매 일부 대기 리스트', wholesaleSuccess: 5, expectedStatus: '등록 대기' },
    { ...completed, title: '최근 실패 확인 리스트', failedCount: 1, expectedStatus: '확인 필요' },
    { ...completed, title: '등록 진행 중 리스트', runningCount: 1, expectedStatus: '진행 중' },
    { ...completed, title: '등록 대상 없는 리스트', retailTotal: 0, wholesaleTotal: 0, retailSuccess: 0, wholesaleSuccess: 0, expectedStatus: '등록 대기' },
    { ...completed, title: '빈 리스트', total: 0, retailTotal: 0, wholesaleTotal: 0, retailSuccess: 0, wholesaleSuccess: 0, expectedStatus: '등록 대기' },
  ].map((list, index) => ({ ...list, id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`, author: '회귀 검증', work_date: '2026-10-19', created_at: '2026-10-19T00:00:00Z' }));
  const errors: string[] = [];
  const fixture = await startFixture({ respond: (route, method) => {
    if (route === '/lists' && method === 'GET') return { lists: lists.map(({ expectedStatus, ...list }) => list) };
  } });
  const web = createServer(async (request, response) => {
    const pathname = new URL(request.url || '/', 'http://local').pathname;
    const file = pathname.startsWith('/assets/') ? path.resolve('dist', pathname.slice(1)) : path.resolve('dist/index.html');
    try {
      const body = await readFile(file);
      response.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.woff2') ? 'font/woff2' : 'text/html');
      response.end(body);
    } catch { response.statusCode = 404; response.end(); }
  });
  let browser: Browser | undefined, app: ElectronApplication | undefined, page: Page;
  try {
    if (surface === 'desktop') {
      app = await electron.launch({ args: ['.'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', CALLA_DESKTOP_TEST: '1', CALLA_TEST_USER_DATA: userData, CALLA_TEST_API_ORIGIN: fixture.origin } });
      page = await app.firstWindow();
    } else {
      await new Promise<void>(resolve => web.listen(0, '127.0.0.1', resolve));
      browser = await chromium.launch({ channel: 'chrome' });
      page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
      await page.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url());
        const response = await page.request.fetch(fixture.origin + url.pathname + url.search, { method: request.method(), headers: request.headers(), data: request.postData() || undefined });
        await route.fulfill({ response });
      });
    }
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**', route => route.abort());
    await page.route(`${AUTH_URL}/auth/v1/**`, route => route.fulfill({ json: route.request().url().includes('/token') ? { access_token: TOKEN, refresh_token: 'fixture-refresh-token', expires_in: 3600, user: AUTH_USER } : AUTH_USER }));
    if (surface === 'web') await page.goto(`http://127.0.0.1:${(web.address() as { port: number }).port}`);
    await page.getByLabel('아이디 또는 이메일', { exact: true }).fill('fixture-admin');
    await page.getByLabel('비밀번호', { exact: true }).fill('fixture-password');
    await page.getByRole('button', { name: '로그인', exact: true }).click();

    const rows = page.locator('.request-table tbody tr');
    await expect(rows).toHaveCount(lists.length);
    for (const list of lists) {
      const row = rows.filter({ has: page.getByRole('button', { name: list.title, exact: true }) });
      await expect(row.getByRole('cell', { name: list.expectedStatus, exact: true })).toBeVisible();
    }
    const completedRow = rows.filter({ has: page.getByRole('button', { name: lists[0].title, exact: true }) });
    await expect(completedRow.getByRole('cell', { name: '6 / 6', exact: true })).toHaveCount(2);
    await mkdir('test-results/list-completion-065', { recursive: true });
    await page.screenshot({ path: `test-results/list-completion-065/${surface}-badges.png`, animations: 'disabled' });

    const filter = page.getByRole('combobox', { name: '작업 상태', exact: true });
    for (const [value, expectedTitles] of [
      ['success', [lists[0].title]],
      ['pending', [lists[1].title, lists[4].title, lists[5].title]],
      ['warning', [lists[2].title]],
      ['running', [lists[3].title]],
    ] as const) {
      await chooseOption(filter, value);
      await expect(rows).toHaveCount(expectedTitles.length);
      await expect(rows.locator('button.table-link')).toHaveText([...expectedTitles]);
    }
    expect(fixture.calls.filter(call => call.method !== 'GET')).toEqual([{ path: '/auth/login', method: 'POST' }]);
    expect(errors).toEqual([]);
  } finally {
    if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    if (browser) await browser.close();
    if (web.listening) await new Promise<void>(resolve => web.close(() => resolve()));
    await fixture.close();
    await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
