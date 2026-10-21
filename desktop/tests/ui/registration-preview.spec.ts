import { test, expect, chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { startFixture, AUTH_URL, AUTH_USER, TOKEN, REGISTRATION_DETAIL_HTML, PREVIEW_IMAGE_PNG } from './fixture';
import { API_ITEM } from '../../../tests/fixtures/godomall';

test('web: a delayed history preview response cannot overwrite a newer operation status', async () => {
  const fixture = await startFixture({ godomall: true });
  fixture.godomall!.tables.product_items[0].automation.detailBlocks = [{ id: 'preview-html', type: 'text', text: REGISTRATION_DETAIL_HTML }];
  const prepared = await fixture.godomall!.request('/godomall/retail/operations/prepare', 'POST', { kind: 'insert', itemId: API_ITEM, choices: { brandCd: '001', scmNo: '1' } });
  expect(prepared.status).toBe(201);
  const stored = fixture.godomall!.tables.godomall_operations[0];
  Object.assign(stored, { state: 'needs_review', error_message: '이전 작업 상태 응답' });
  const endpoint = `/api/godomall/retail/operations/${stored.id}`;
  const web = createServer(async (req, res) => {
    const pathname = new URL(req.url || '/', 'http://local').pathname;
    const file = pathname.startsWith('/assets/') ? path.resolve('dist', pathname.slice(1)) : path.resolve('dist/index.html');
    try {
      const data = await readFile(file);
      res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.woff2') ? 'font/woff2' : 'text/html');
      res.end(data);
    } catch { res.statusCode = 404; res.end(); }
  });
  let releaseInitial!: () => void, markInitialCaptured!: () => void;
  const initialGate = new Promise<void>(resolve => { releaseInitial = resolve; });
  const initialCaptured = new Promise<void>(resolve => { markInitialCaptured = resolve; });
  let reads = 0;
  const errors: string[] = [];
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await new Promise<void>(resolve => web.listen(0, '127.0.0.1', resolve));
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://example.test/**', route => route.fulfill({ contentType: 'image/png', body: PREVIEW_IMAGE_PNG }));
    await page.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url());
      const response = await page.request.fetch(fixture.origin + url.pathname + url.search, { method: req.method(), headers: req.headers(), data: req.postData() || undefined });
      if (url.pathname === endpoint && req.method() === 'GET' && ++reads === 1) {
        const stale = await response.json();
        markInitialCaptured();
        await initialGate;
        await route.fulfill({ json: stale, headers: { 'x-fixture-response': 'stale-history' } });
      } else await route.fulfill({ response });
    });
    await page.route(`${AUTH_URL}/auth/v1/**`, route => route.fulfill({ json: route.request().url().includes('/token') ? { access_token: TOKEN, refresh_token: 'fixture-refresh-token', expires_in: 3600, user: AUTH_USER } : AUTH_USER }));
    await page.goto(`http://127.0.0.1:${(web.address() as { port: number }).port}`);
    await page.getByLabel('아이디 또는 이메일', { exact: true }).fill('fixture-admin');
    await page.getByLabel('비밀번호', { exact: true }).fill('fixture-password');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.getByRole('button', { name: '상품 조회', exact: true }).click();
    await page.getByRole('button', { name: '작업 결과 보기', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: '소매몰 · 등록', exact: true })).toBeVisible();
    await initialCaptured;
    await expect(dialog.locator('.badge.warning').filter({ hasText: '결과 확인 필요' })).toBeVisible();
    Object.assign(stored, { state: 'success', goods_no: '1000000999', error_message: null, checked_at: '2026-10-15T04:30:00.000Z' });
    await dialog.getByRole('button', { name: '작업 상태 다시 조회', exact: true }).click();
    await expect(dialog.locator('.badge.success').filter({ hasText: '반영 확인 완료' })).toBeVisible();
    const staleResponse = page.waitForResponse(response => response.headers()['x-fixture-response'] === 'stale-history');
    releaseInitial();
    await (await staleResponse).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(dialog.locator('.badge.success').filter({ hasText: '반영 확인 완료' })).toBeVisible();
    await expect(dialog.locator('.badge.warning').filter({ hasText: '결과 확인 필요' })).toHaveCount(0);
    await expect(dialog).not.toContainText('이전 작업 상태 응답');
    await expect(dialog.getByRole('button', { name: '등록 실행', exact: true })).toHaveCount(0);
    expect(reads).toBe(2);
    expect(fixture.godomall!.calls.filter(call => call.endpoint === 'Goods_Insert.php')).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    releaseInitial();
    await page.unrouteAll({ behavior: 'wait' });
    await browser.close();
    await new Promise<void>(resolve => web.close(() => resolve()));
    await fixture.close();
  }
});
