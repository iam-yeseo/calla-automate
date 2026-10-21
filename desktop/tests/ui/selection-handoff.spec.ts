import { test, expect, chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startFixture, AUTH_URL, AUTH_USER, TOKEN } from './fixture';
import { API_LIST, sourceProduct } from '../../../tests/fixtures/godomall';

test('selected App detail products open read-only review in the same saved list', async () => {
  const fixture = await startFixture({ godomall: true });
  const targetListId = '11111111-1111-4111-8111-111111111112';
  const products = [1, 2].map(index => ({ ...sourceProduct(), id: `22222222-2222-4222-8222-22222222222${index}`, list_id: targetListId, seq: index, name_own: `선택 검증 상품 ${index}` }));
  const lists = [
    { id: API_LIST, title: '첫 번째 미선택 리스트', total: 1 },
    { id: targetListId, title: '두 번째 선택 검증 리스트', total: 2 },
  ].map(list => ({ ...list, author: '검증', work_date: '2026-10-07', created_at: '2026-10-07T00:00:00Z' }));
  const requests: { path: string; method: string }[] = [];
  const errors: string[] = [];
  const web = createServer(async (req, res) => {
    const pathname = new URL(req.url || '/', 'http://local').pathname;
    const file = pathname.startsWith('/assets/') ? path.resolve('dist', pathname.slice(1)) : path.resolve('dist/index.html');
    try { const data = await readFile(file); res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.woff2') ? 'font/woff2' : 'text/html'); res.end(data); }
    catch { res.statusCode = 404; res.end(); }
  });
  await new Promise<void>(resolve => web.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url());
      requests.push({ path: url.pathname + url.search, method: request.method() });
      if (url.pathname === '/api/lists') return route.fulfill({ json: { lists } });
      if (url.pathname === `/api/lists/${targetListId}`) return route.fulfill({ json: { list: lists[1] } });
      if (url.pathname === `/api/lists/${targetListId}/items`) return route.fulfill({ json: { items: products } });
      if (url.pathname === `/api/lists/${targetListId}/registrations`) return route.fulfill({ json: { registrations: [] } });
      const response = await page.request.fetch(fixture.origin + url.pathname + url.search, { method: request.method(), headers: request.headers(), data: request.postData() || undefined });
      await route.fulfill({ response });
    });
    await page.route(`${AUTH_URL}/auth/v1/**`, route => route.fulfill({ json: route.request().url().includes('/token') ? { access_token: TOKEN, refresh_token: 'fixture-refresh-token', expires_in: 3600, user: AUTH_USER } : AUTH_USER }));
    await page.goto(`http://127.0.0.1:${(web.address() as { port: number }).port}`);
    await page.getByLabel('아이디 또는 이메일', { exact: true }).fill('fixture-admin');
    await page.getByLabel('비밀번호', { exact: true }).fill('fixture-password');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.getByRole('button', { name: lists[1].title, exact: true }).click();
    await expect(page.getByRole('heading', { name: lists[1].title, exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: '선택 검증 상품 2 선택', exact: true }).check();
    await expect(page.getByRole('checkbox', { name: '선택 검증 상품 1 선택', exact: true })).not.toBeChecked();
    const beforeReview = requests.length;
    await page.getByRole('button', { name: '등록 전 검토', exact: true }).click();
    await expect(page).toHaveURL(/\/automation\/$/);
    const modal = page.getByRole('dialog');
    await expect(modal.getByRole('heading', { name: '등록 전 검토', exact: true })).toBeVisible();
    await expect(modal).toContainText(`${lists[1].title} · 선택 상품 1개 · 총 2건`);
    await expect(modal.locator('.operations-price-table tbody tr')).toHaveCount(1);
    await expect(modal.locator('.registration-review-table tbody tr')).toHaveCount(2);
    await expect(modal.locator('.registration-review-table tbody tr')).toContainText(['선택 검증 상품 2', '선택 검증 상품 2']);
    await expect(modal).not.toContainText('선택 검증 상품 1');
    const writes = requests.filter(request => request.method !== 'GET' && request.path !== '/api/auth/login');
    expect(writes).toEqual([]);
    expect(requests.slice(beforeReview).every(request => request.method === 'GET')).toBe(true);
    expect(fixture.godomall!.tables.godomall_operations).toHaveLength(0);
    expect(fixture.godomall!.calls.filter(call => /Goods_(Insert|Update|Delete)/.test(call.endpoint))).toHaveLength(0);
    await mkdir('test-results/redesign-050/operations', { recursive: true });
    await page.screenshot({ path: 'test-results/redesign-050/operations/selection-handoff.png', animations: 'disabled' });
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === `/api/lists/${targetListId}/items`),
      page.waitForResponse(response => new URL(response.url()).pathname === `/api/lists/${targetListId}/registrations`),
      modal.getByRole('button', { name: '취소', exact: true }).click(),
    ]);
    await expect(page.locator('.automation-products')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByRole('heading', { name: lists[1].title, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /두 번째 선택 검증 리스트.*저장 완료/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('checkbox', { name: '선택 검증 상품 2 등록 선택', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: '선택 검증 상품 1 등록 선택', exact: true })).not.toBeChecked();
    expect(requests.slice(beforeReview).every(request => request.method === 'GET')).toBe(true);
    expect(errors).toEqual([]);
    await writeFile('test-results/redesign-050/operations/selection-handoff.json', JSON.stringify({ passed: true, listId: targetListId, selectedProductIds: [products[1].id], reviewProducts: 1, reviewMallRows: 2, selectionPreservedAfterCancelRefresh: true, requestsAfterReview: requests.slice(beforeReview), productWriteRequests: writes, operationsCreated: fixture.godomall!.tables.godomall_operations.length, errors }, null, 2));
  } finally { await browser.close(); await new Promise<void>(resolve => web.close(() => resolve())); await fixture.close(); }
});
