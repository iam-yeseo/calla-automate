import { test, expect, chromium, _electron as electron, type Browser, type ElectronApplication, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { startFixture, AUTH_URL, AUTH_USER, TOKEN } from './fixture';

const filename = 'CALLA_리스트등록_빈템플릿.xlsx';
const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const templateHash = '7da94bbcb2100464d7b403f00378aae676f3a1a78ec3d436e97053628d477814';

for (const surface of ['web', 'desktop'] as const) test(`${surface}: download the exact blank XLSX template and preview a filled copy without creating a list`, async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'calla-template-download-'));
  const outputDir = path.resolve('test-results/template-download-066', surface);
  await mkdir(outputDir, { recursive: true });
  const destination = path.join(outputDir, filename);
  await rm(destination, { force: true });
  const fixture = await startFixture();
  const errors: string[] = [];
  const web = createServer(async (request, response) => {
    const pathname = new URL(request.url || '/', 'http://local').pathname;
    const file = pathname.startsWith('/assets/') || pathname.startsWith('/templates/') ? path.resolve('dist', pathname.slice(1)) : path.resolve('dist/index.html');
    try {
      const contentTypes: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.xlsx': mime };
      response.setHeader('content-type', contentTypes[path.extname(file)] || 'text/html');
      response.end(await readFile(file));
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
    await page.getByRole('button', { name: '리스트 만들기', exact: true }).click();
    const modal = page.getByRole('dialog', { name: '리스트 만들기', exact: true });
    await modal.getByLabel('빈 리스트로 시작하기', { exact: true }).uncheck();
    const downloadButton = modal.getByRole('button', { name: 'Excel 템플릿 다운로드', exact: true });
    await expect(downloadButton).toBeVisible();
    await page.screenshot({ path: path.join(outputDir, 'download-button.png'), animations: 'disabled' });

    let savedName: string;
    if (app) {
      await app.evaluate(({ session }, savePath) => {
        (globalThis as any).__templateDownload = { state: 'waiting', filename: '' };
        session.defaultSession.once('will-download', (_event, item) => {
          (globalThis as any).__templateDownload.filename = item.getFilename();
          item.setSavePath(savePath);
          item.once('done', (_event, state) => { (globalThis as any).__templateDownload.state = state; });
        });
      }, destination);
      await downloadButton.click();
      await expect.poll(() => app!.evaluate(() => (globalThis as any).__templateDownload.state)).toBe('completed');
      savedName = await app.evaluate(() => (globalThis as any).__templateDownload.filename);
    } else {
      const downloaded = page.waitForEvent('download');
      await downloadButton.click();
      const download = await downloaded;
      savedName = download.suggestedFilename();
      await download.saveAs(destination);
      expect(await download.failure()).toBeNull();
    }
    expect(savedName).toBe(filename);
    const bytes = await readFile(destination);
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    expect(actualHash).toBe(templateHash);
    expect(bytes.equals(await readFile('public/templates/calla-product-list-template.xlsx'))).toBe(true);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['230110']);
    const sheet = workbook.worksheets[0];
    expect([sheet.rowCount, sheet.columnCount]).toEqual([47, 15]);
    expect(['B3', 'C3', 'D3', 'G3', 'G4', 'H4', 'I3', 'J5', 'K5', 'M3', 'O3'].map(address => sheet.getCell(address).value))
      .toEqual(['브랜드', '품명', '모델명', '등록 여부', '자사몰', '도매몰', '가격', '베이직', '마스터', '링크', '비고']);
    expect(sheet.model.merges).toEqual(expect.arrayContaining(['A3:A5', 'B3:B5', 'G3:H3', 'I3:K3', 'J4:K4', 'M3:N5', 'M6:N6']));
    for (let row = 6; row <= 47; row++) for (let column = 1; column <= 15; column++) expect(sheet.getCell(row, column).value).toBeNull();

    // Fill only an in-memory copy of the downloaded workbook; preview must never save.
    for (const [address, value] of Object.entries({ B6: 'TEST', C6: '템플릿 가져오기 검증 상품', D6: 'MODEL-066', E6: '신규', G6: 'O', H6: 'X', I6: 120000, J6: 90000, K6: 80000, M6: 'https://example.test/product', O6: '다운로드 양식 검증' })) sheet.getCell(address).value = value;
    const populated = Buffer.from(await workbook.xlsx.writeBuffer());
    await modal.locator('input[type="file"]').setInputFiles({ name: 'template-preview.xlsx', mimeType: mime, buffer: populated });
    const preview = modal.getByLabel('파일 인식 결과');
    await expect(preview).toContainText('1개 상품을 인식했습니다.');
    await expect(preview).toContainText('첫 번째 시트 ‘230110’');
    await expect(preview).toContainText('3줄 제목을 기준으로 가져옵니다.');
    await expect(modal.getByRole('alert')).toHaveCount(0);
    expect(fixture.calls.filter(call => call.method !== 'GET')).toEqual([{ path: '/auth/login', method: 'POST' }]);
    expect(errors).toEqual([]);
    await preview.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(outputDir, 'import-preview.png'), animations: 'disabled' });
    await writeFile(path.join(outputDir, 'verification.json'), JSON.stringify({ passed: true, surface, filename: savedName, bytes: bytes.length, sha256: actualHash, worksheet: sheet.name, headerRows: [3, 4, 5], blankInputRows: [6, 47], previewProductCount: 1, productWrites: 0, errors }, null, 2) + '\n');
    await modal.getByRole('button', { name: '취소', exact: true }).click();
  } finally {
    if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    if (browser) await browser.close();
    if (web.listening) await new Promise<void>(resolve => web.close(() => resolve()));
    await fixture.close();
    await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
