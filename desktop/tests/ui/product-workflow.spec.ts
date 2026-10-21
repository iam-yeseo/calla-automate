import { chooseOption } from './select-control';
import { test, expect, chromium, _electron as electron, type Browser, type ElectronApplication, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startFixture, AUTH_URL, AUTH_USER, TOKEN } from './fixture';
import { API_LIST, sourceProduct } from '../../../tests/fixtures/godomall';
import type { Product } from '../../../src/types';

for (const surface of ['web', 'desktop'] as const) test(`${surface}: product origin, wholesale price, thumbnails, page sizes, select all and mouse history`, async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'calla-product-workflow-'));
  const list = { id: API_LIST, title: '상품 개선 검증', author: '검증', work_date: '2026-10-07', created_at: '2026-10-07T00:00:00Z', total: 25 };
  let products: Product[] = Array.from({ length: 25 }, (_, i) => ({ ...sourceProduct(), id: `22222222-2222-4222-8222-${String(i + 1).padStart(12, '0')}`, seq: i + 1, name_own: `검증 상품 ${i + 1}`, done: i === 24 }));
  const errors: string[] = [], writes: string[] = [];
  const fixture = await startFixture({ godomall: true, respond: (route, method, body) => {
    if (method !== 'GET') writes.push(`/api${route}`);
    if (route === '/lists') return { lists: [list] };
    if (route === `/lists/${API_LIST}`) return { list };
    if (route === `/lists/${API_LIST}/items`) return { items: products };
    if (route === `/lists/${API_LIST}/registrations`) return { registrations: [] };
    if (route === `/lists/${API_LIST}/draft`) { products = JSON.parse(body).items.map((item: Product) => ({ ...products.find(product => product.id === item.id), ...item })); return { ok: true }; }
  } });
  let browser: Browser | undefined, app: ElectronApplication | undefined, page: Page;
  const web = createServer(async (req, res) => {
    const pathname = new URL(req.url || '/', 'http://local').pathname;
    const file = pathname.startsWith('/assets/') ? path.resolve('dist', pathname.slice(1)) : path.resolve('dist/index.html');
    try { const data = await readFile(file); res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.woff2') ? 'font/woff2' : 'text/html'); res.end(data); }
    catch { res.statusCode = 404; res.end(); }
  });
  try {
    if (surface === 'desktop') {
      app = await electron.launch({ args: ['.'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', CALLA_DESKTOP_TEST: '1', CALLA_TEST_USER_DATA: userData, CALLA_TEST_API_ORIGIN: fixture.origin } });
      page = await app.firstWindow();
    } else {
      await new Promise<void>(resolve => web.listen(0, '127.0.0.1', resolve));
      browser = await chromium.launch({ channel: 'chrome' }); page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    }
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://example.test/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#F27490"/></svg>' }));
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url());
      const response = await page.request.fetch(fixture.origin + url.pathname + url.search, { method: request.method(), headers: request.headers(), data: request.postData() || undefined });
      return route.fulfill({ response });
    });
    await page.route(`${AUTH_URL}/auth/v1/**`, route => route.fulfill({ json: route.request().url().includes('/token') ? { access_token: TOKEN, refresh_token: 'fixture-refresh-token', expires_in: 3600, user: AUTH_USER } : AUTH_USER }));
    if (surface === 'web') await page.goto(`http://127.0.0.1:${(web.address() as { port: number }).port}`);
    await page.getByLabel('아이디 또는 이메일', { exact: true }).fill('fixture-admin');
    await page.getByLabel('비밀번호', { exact: true }).fill('fixture-password');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.getByRole('button', { name: list.title, exact: true }).click();
    const table = page.locator('.product-table');
    await expect(table.locator('tbody tr')).toHaveCount(20);
    await expect(table.getByRole('columnheader', { name: '상품 ID', exact: true })).toHaveCount(0);
    await expect(table.locator('tbody tr').first().getByAltText('상품 썸네일')).toBeVisible();
    await expect.poll(() => table.locator('tbody tr').first().getByAltText('상품 썸네일').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(80);
    const sizes = page.getByRole('combobox', { name: '페이지당 표시 개수', exact: true });
    await sizes.click(); await expect(page.getByRole('listbox').getByRole('option')).toHaveText(['10개 보기', '20개 보기', '30개 보기', '50개 보기', '100개 보기']); await sizes.press('Escape');
    await chooseOption(sizes, '10'); await expect(table.locator('tbody tr')).toHaveCount(10);
    await page.getByRole('checkbox', { name: '현재 상품 전체 선택', exact: true }).check();
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await expect(table.locator('tbody tr').first()).toContainText('검증 상품 11');
    await expect(table.locator('tbody input:checked')).toHaveCount(0);
    await page.getByRole('button', { name: '다음', exact: true }).click(); await expect(table.locator('tbody tr')).toHaveCount(5);
    for (const size of ['20', '30', '50', '100']) { await chooseOption(sizes, size); await expect(table.locator('tbody tr')).toHaveCount(Math.min(25, Number(size))); }
    await page.getByRole('button', { name: '검증 상품 1', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '상품 편집', exact: true });
    await expect(editor.getByRole('combobox', { name: '원산지', exact: true })).toContainText('대한민국 (Korea)');
    await chooseOption(editor.getByRole('combobox', { name: '원산지', exact: true }), 'China');
    await expect(editor).toContainText('Made in China');
    const wholesale = editor.getByLabel('도매 정가', { exact: true });
    await expect(wholesale).toBeDisabled(); await expect(wholesale).toHaveValue('1,000');
    await editor.getByLabel('소매 판매가', { exact: true }).fill('2400'); await expect(wholesale).toHaveValue('2,400');
    await editor.getByRole('checkbox', { name: '직접 입력', exact: true }).check(); await wholesale.fill('3100');
    await editor.getByLabel('소매 판매가', { exact: true }).fill('2600'); await expect(wholesale).toHaveValue('3,100');
    await editor.getByRole('checkbox', { name: '직접 입력', exact: true }).uncheck(); await expect(wholesale).toHaveValue('2,600');
    await editor.getByRole('checkbox', { name: '직접 입력', exact: true }).check(); await wholesale.fill('0');
    await chooseOption(editor.getByRole('combobox', { name: '원산지', exact: true }), 'custom');
    await editor.getByRole('button', { name: '목록에 반영', exact: true }).click(); await expect(editor).toBeVisible();
    await editor.getByLabel('원산지 영어 국가명').fill('Germany');
    await editor.getByLabel('상품명', { exact: true }).fill('<b>Literal & Name</b>');
    await mkdir('test-results/product-workflow-051', { recursive: true });
    await page.screenshot({ path: `test-results/product-workflow-051/${surface}-editor.png` });
    await editor.getByRole('button', { name: '목록에 반영', exact: true }).click();
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByRole('button', { name: '저장됨', exact: true })).toBeVisible();
    expect(products[0].automation.origin).toBe('Made in Germany');
    expect(products[0].automation.wholesaleRegularPrice).toEqual({ mode: 'manual', value: 0 });
    expect(products[0].name_own).toBe('<b>Literal & Name</b>');
    await page.getByRole('button', { name: 'Literal & Name', exact: true }).click();
    await expect(editor.getByLabel('원산지 영어 국가명')).toHaveValue('Germany');
    await expect(editor.getByLabel('도매 정가', { exact: true })).toHaveValue('0');
    await editor.getByRole('button', { name: '취소', exact: true }).click();
    await page.getByRole('dialog', { name: '편집을 취소할까요?', exact: true }).getByRole('button', { name: '편집 취소', exact: true }).click();
    await page.getByRole('navigation', { name: '상품 운영 메뉴' }).getByRole('button', { name: '자동 상품 등록', exact: true }).click();
    const selectAll = page.getByRole('checkbox', { name: '현재 리스트 등록 가능한 상품 전체 선택', exact: true });
    await expect(selectAll).toBeChecked(); await selectAll.uncheck();
    await expect(page.locator('.automation-products-table tbody input:checked')).toHaveCount(0);
    await page.getByRole('checkbox', { name: '검증 상품 2 등록 선택', exact: true }).check();
    await expect(selectAll).toHaveJSProperty('indeterminate', true);
    await selectAll.check(); await expect(page.locator('.automation-products-table tbody input:checked')).toHaveCount(24);
    await expect(page.getByRole('checkbox', { name: '검증 상품 25 등록 선택', exact: true })).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: '검증 상품 25 등록 선택', exact: true })).not.toBeChecked();
    await page.screenshot({ path: `test-results/product-workflow-051/${surface}-select-all.png` });
    const cdp = await page.context().newCDPSession(page);
    const mouseHistory = async (button: 'back' | 'forward') => {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 180, button, clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 180, button, clickCount: 1 });
    };
    await mouseHistory('back'); await expect(page).toHaveURL(new RegExp(`/edit/\\?list=${API_LIST}$`));
    await expect(page.getByRole('heading', { name: list.title, exact: true })).toBeVisible();
    await mouseHistory('forward'); await expect(page).toHaveURL(/\/automation\/$/);
    await mouseHistory('back'); await expect(page.getByRole('heading', { name: list.title, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Literal & Name', exact: true }).click();
    await editor.getByLabel('소매 판매가', { exact: true }).fill('8888');
    await editor.getByRole('button', { name: '목록에 반영', exact: true }).click();
    await mouseHistory('back');
    const discard = page.getByRole('dialog', { name: '저장하지 않은 변경사항이 있습니다', exact: true });
    await expect(discard).toBeVisible();
    await discard.getByRole('button', { name: '취소', exact: true }).click();
    await expect(discard).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/edit/\\?list=${API_LIST}$`));
    await expect(table.locator('tbody tr').first()).toContainText('8,888');
    await mouseHistory('back'); await expect(discard).toBeVisible();
    await discard.getByRole('button', { name: '확인', exact: true }).click();
    await expect(page.getByRole('heading', { name: '등록 요청 상품', exact: true })).toBeVisible();
    await mouseHistory('forward'); await expect(page.getByRole('heading', { name: list.title, exact: true })).toBeVisible();
    await expect(table.locator('tbody tr').first()).toContainText('2,600');
    await expect(sizes).toContainText('100개 보기');
    if (app) {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].emit('app-command', {}, 'browser-backward'));
      await expect(page.getByRole('heading', { name: '등록 요청 상품', exact: true })).toBeVisible();
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].emit('app-command', {}, 'browser-forward'));
      await expect(page.getByRole('heading', { name: list.title, exact: true })).toBeVisible();
    }
    expect(writes.filter(url => !url.endsWith('/auth/login') && !url.endsWith('/draft'))).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    if (browser) await browser.close();
    await new Promise<void>(resolve => web.close(() => resolve())); await fixture.close();
    await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
