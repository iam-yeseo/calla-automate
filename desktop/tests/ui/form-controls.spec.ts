import { test, expect, chromium, _electron as electron, type Browser, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startFixture, AUTH_URL, AUTH_USER, TOKEN } from './fixture';
import { API_LIST, sourceProduct } from '../../../tests/fixtures/godomall';

async function expectPopupInsideWindow(popup: Locator) {
  await expect.poll(() => popup.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const titlebar = document.querySelector('.desktop-titlebar')?.getBoundingClientRect();
    const point = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= (titlebar?.bottom || 0)
      && bounds.bottom <= innerHeight && !!point && element.contains(point);
  })).toBe(true);
}

for (const surface of ['web', 'desktop'] as const) test(`${surface}: styled dropdown and calendar keyboard, compact sizing and modal popovers`, async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'calla-form-controls-'));
  const list = { id: API_LIST, title: '폼 요소 검증', author: '검증', work_date: '2028-02-29', created_at: '2026-10-07T00:00:00Z', total: 25 };
  const products = Array.from({ length: 25 }, (_, index) => ({ ...sourceProduct(), id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`, seq: index + 1, name_own: `폼 검증 상품 ${index + 1}`, image_url: '' }));
  const folders = ['audio', ...Array.from({ length: 80 }, (_, index) => `folder-${String(index + 1).padStart(3, '0')}`)];
  const errors: string[] = [], writes: string[] = [];
  const fixture = await startFixture({ godomall: true, respond: (route, method) => {
    if (method !== 'GET') writes.push(route);
    if (route === '/lists') return { lists: [list] };
    if (route === `/lists/${API_LIST}`) return { list };
    if (route === `/lists/${API_LIST}/items`) return { items: products };
    if (route === `/lists/${API_LIST}/registrations`) return { registrations: [] };
    if (route === '/settings' && method === 'GET') return { value: { schemaVersion: 1, folders, brands: [], categories: { retail: [], wholesale: [] }, brandsByMall: { retail: [], wholesale: [] } }, updated_at: '2026-10-15T00:00:00Z' };
  } });
  let browser: Browser | undefined, app: ElectronApplication | undefined, page: Page;
  const web = createServer(async (request, response) => {
    const pathname = new URL(request.url || '/', 'http://local').pathname;
    const file = pathname.startsWith('/assets/') ? path.resolve('dist', pathname.slice(1)) : path.resolve('dist/index.html');
    try {
      const data = await readFile(file);
      response.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.woff2') ? 'font/woff2' : 'text/html');
      response.end(data);
    } catch { response.statusCode = 404; response.end(); }
  });
  try {
    if (surface === 'desktop') {
      app = await electron.launch({ args: ['.'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', CALLA_DESKTOP_TEST: '1', CALLA_TEST_USER_DATA: userData, CALLA_TEST_API_ORIGIN: fixture.origin } });
      page = await app.firstWindow();
    } else {
      await new Promise<void>(resolve => web.listen(0, '127.0.0.1', resolve));
      browser = await chromium.launch({ channel: 'chrome' });
      page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    }
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://example.test/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"></svg>' }));
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url());
      const response = await page.request.fetch(fixture.origin + url.pathname + url.search, { method: request.method(), headers: request.headers(), data: request.postData() || undefined });
      await route.fulfill({ response });
    });
    await page.route(`${AUTH_URL}/auth/v1/**`, route => route.fulfill({ json: route.request().url().includes('/token') ? { access_token: TOKEN, refresh_token: 'fixture-refresh-token', expires_in: 3600, user: AUTH_USER } : AUTH_USER }));
    if (surface === 'web') await page.goto(`http://127.0.0.1:${(web.address() as { port: number }).port}`);
    await page.getByLabel('아이디 또는 이메일', { exact: true }).fill('fixture-admin');
    await page.getByLabel('비밀번호', { exact: true }).fill('fixture-password');
    await page.getByRole('button', { name: '로그인', exact: true }).click();

    await page.getByRole('navigation', { name: '상품 운영 메뉴' }).getByRole('button', { name: '카테고리와 브랜드', exact: true }).click();
    const disabledFolder = page.getByRole('combobox', { name: '소매 이미지 폴더', exact: true });
    await expect(disabledFolder).toBeDisabled();
    await disabledFolder.evaluate((element: HTMLButtonElement) => element.click());
    await expect(disabledFolder).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.calla-select-menu')).toHaveCount(0);
    await page.getByRole('navigation', { name: '상품 운영 메뉴' }).getByRole('button', { name: /등록 요청 상품/ }).click();
    await page.getByRole('button', { name: list.title, exact: true }).click();

    const sizes = page.getByRole('combobox', { name: '페이지당 표시 개수', exact: true });
    const table = page.locator('.product-table');
    await expect(sizes).toContainText('20개 보기');
    expect((await sizes.boundingBox())!.width).toBeLessThanOrEqual(130);
    await sizes.press('ArrowDown');
    const menu = page.locator('.calla-select-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('option')).toHaveText(['10개 보기', '20개 보기', '30개 보기', '50개 보기', '100개 보기']);
    await expect(menu.getByRole('option', { name: '20개 보기', exact: true })).toHaveAttribute('aria-selected', 'true');
    await sizes.press('End');
    await sizes.press('Enter');
    await expect(sizes).toContainText('100개 보기');
    await expect(table.locator('tbody tr')).toHaveCount(25);
    await sizes.press('ArrowDown');
    await sizes.press('Home');
    await sizes.press('Escape');
    await expect(sizes).toContainText('100개 보기');
    await expect(sizes).toBeFocused();
    await expect(sizes).toHaveAttribute('aria-expanded', 'false');
    await sizes.press('3');
    await expect(sizes).toContainText('30개 보기');

    if (app) await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1040, 650));
    else await page.setViewportSize({ width: 1040, height: 650 });
    await sizes.click();
    await expectPopupInsideWindow(menu);
    await mkdir('test-results/form-controls', { recursive: true });
    await page.screenshot({ animations: 'disabled', path: `test-results/form-controls/${surface}-pagination-dropdown.png` });
    await menu.getByRole('option', { name: '10개 보기', exact: true }).click();
    await expect(table.locator('tbody tr')).toHaveCount(10);
    await page.getByRole('button', { name: '폼 검증 상품 1', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '상품 편집', exact: true });
    const origin = editor.getByRole('combobox', { name: '원산지', exact: true });
    await origin.click();
    await expectPopupInsideWindow(menu);
    await page.screenshot({ animations: 'disabled', path: `test-results/form-controls/${surface}-modal-dropdown.png` });
    await menu.getByRole('option', { name: '중국 (China)', exact: true }).click();
    await expect(editor).toContainText('Made in China');
    await expect(origin).toBeFocused();
    await origin.press('ArrowDown');
    await origin.press('Escape');
    await expect(editor).toBeVisible();
    await expect(origin).toContainText('중국 (China)');
    await editor.getByRole('tab', { name: '이미지 설정', exact: true }).click();
    const extension = editor.getByRole('combobox', { name: '확장자', exact: true });
    await extension.press('w');
    await expect(extension).toContainText('webp');
    await extension.click();
    await expectPopupInsideWindow(menu);
    await extension.press('Escape');
    await expect(editor).toBeVisible();
    const folder = editor.getByRole('combobox', { name: '서버 폴더', exact: true });
    await folder.click();
    await expectPopupInsideWindow(menu);
    await expect(menu.getByRole('option')).toHaveCount(folders.length + 1);
    const bodyScroll = await editor.locator('.modal-body').evaluate(element => element.scrollTop);
    const bounds = (await menu.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    for (let index = 0; index < 5; index++) {
      const before = await menu.evaluate(element => element.scrollTop);
      await page.mouse.wheel(0, 100);
      await expect.poll(() => menu.evaluate(element => element.scrollTop)).toBeGreaterThan(before + 60);
    }
    // Hovering a partly visible row must not undo wheel/trackpad scrolling.
    await menu.evaluate(element => { element.scrollTop = 450; });
    await page.mouse.move(bounds.x + bounds.width / 2 + 3, bounds.y + 7);
    const afterHover = await menu.evaluate(async element => {
      for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame);
      return element.scrollTop;
    });
    expect(afterHover).toBe(450);
    expect(await editor.locator('.modal-body').evaluate(element => element.scrollTop)).toBe(bodyScroll);
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.wheel(0, 100000);
    const bottomGap = await menu.evaluate(async element => {
      for (let frame = 0; frame < 12; frame++) await new Promise(requestAnimationFrame);
      return element.scrollHeight - element.scrollTop - element.clientHeight;
    });
    expect(bottomGap).toBeLessThan(12);
    await page.screenshot({ animations: 'disabled', path: `test-results/form-controls/${surface}-server-folder-bottom.png` });
    await folder.press('Home');
    await expect.poll(() => menu.evaluate(element => element.scrollTop)).toBeLessThan(12);
    await folder.press('End');
    await expect.poll(() => menu.evaluate(element => Math.abs(element.scrollHeight - element.scrollTop - element.clientHeight))).toBeLessThan(12);
    await folder.press('Enter');
    await expect(folder).toContainText('folder-080');
    await expect(folder).toBeFocused();
    await editor.getByRole('button', { name: '취소', exact: true }).click();
    await page.getByRole('dialog', { name: '편집을 취소할까요?', exact: true }).getByRole('button', { name: '편집 취소', exact: true }).click();

    await page.getByRole('button', { name: '리스트 정보', exact: true }).click();
    const metadata = page.getByRole('dialog', { name: '리스트 정보', exact: true });
    const workDate = metadata.getByLabel('작성일', { exact: true });
    const calendarTrigger = metadata.getByRole('button', { name: '달력에서 날짜 선택', exact: true });
    await expect(workDate).toHaveValue('2028/02/29');
    await calendarTrigger.click();
    const calendar = page.getByRole('dialog', { name: '날짜 선택 달력', exact: true });
    await expect(calendar).toBeVisible();
    await expectPopupInsideWindow(calendar);
    const leapDay = calendar.getByRole('button', { name: '2028년 2월 29일 화요일', exact: true });
    await expect(leapDay).toBeFocused();
    await leapDay.press('ArrowRight');
    const marchFirst = calendar.getByRole('button', { name: '2028년 3월 1일 수요일', exact: true });
    await expect(marchFirst).toBeFocused();
    await expect(workDate).toHaveValue('2028/02/29');
    await marchFirst.press('ArrowLeft');
    await expect(leapDay).toBeFocused();
    await calendar.getByRole('button', { name: '다음 달', exact: true }).click();
    await expect(calendar.getByRole('button', { name: '3월 선택', exact: true })).toBeVisible();
    await calendar.getByRole('button', { name: '이전 달', exact: true }).click();
    await calendar.getByRole('button', { name: '2028년 선택', exact: true }).click();
    await calendar.getByRole('button', { name: '2027년', exact: true }).click();
    await calendar.getByRole('button', { name: '2월', exact: true }).click();
    await expect(calendar.getByRole('button', { name: /^2027년 2월 29일 / })).toHaveCount(0);
    await calendar.getByRole('button', { name: '2027년 2월 28일 일요일', exact: true }).click();
    await expect(calendar).toHaveCount(0);
    await expect(workDate).toHaveValue('2027/02/28');
    await expect(calendarTrigger).toBeFocused();
    await calendarTrigger.click();
    await page.keyboard.press('Escape');
    await expect(calendar).toHaveCount(0);
    await expect(metadata).toBeVisible();
    await expect(calendarTrigger).toBeFocused();
    await workDate.fill('2027/02/29');
    await expect(workDate).toHaveAttribute('aria-invalid', 'true');
    await workDate.press('Tab');
    await expect(workDate).toHaveValue('2027/02/28');
    await calendarTrigger.click();
    await page.screenshot({ animations: 'disabled', path: `test-results/form-controls/${surface}-calendar.png` });
    await page.keyboard.press('Escape');
    await metadata.getByRole('button', { name: '확인', exact: true }).click();
    expect(writes.filter(route => route !== '/auth/login')).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    if (browser) await browser.close();
    if (web.listening) await new Promise<void>(resolve => web.close(() => resolve()));
    await fixture.close();
    await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
