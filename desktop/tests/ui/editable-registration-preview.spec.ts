import { test, expect, chromium, _electron as electron, type Page, type Browser, type ElectronApplication } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startFixture, AUTH_URL, AUTH_USER, TOKEN, PREVIEW_IMAGE_PNG, REGISTRATION_DETAIL_HTML } from './fixture';
import { API_ITEM } from '../../../tests/fixtures/godomall';
import { value } from '../../../server/godomall-xml';
import { chooseOption } from './select-control';

type Fixture = Awaited<ReturnType<typeof startFixture>>;
async function launchPreview(surface: 'web' | 'desktop', fixture: Fixture) {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'calla-editable-preview-'));
  let browser: Browser | undefined, app: ElectronApplication | undefined;
  const errors: string[] = [];
  const web = createServer(async (req, res) => {
    const pathname = new URL(req.url || '/', 'http://local').pathname;
    const file = pathname.startsWith('/assets/') ? path.resolve('dist', pathname.slice(1)) : path.resolve('dist/index.html');
    try {
      const body = await readFile(file);
      res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.woff2') ? 'font/woff2' : 'text/html');
      res.end(body);
    } catch { res.statusCode = 404; res.end(); }
  });
  let page: Page;
  if (surface === 'desktop') {
    app = await electron.launch({ args: ['.'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', CALLA_DESKTOP_TEST: '1', CALLA_TEST_USER_DATA: userData, CALLA_TEST_API_ORIGIN: fixture.origin } });
    page = await app.firstWindow();
  } else {
    await new Promise<void>(resolve => web.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ channel: 'chrome' });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url());
      const response = await page.request.fetch(fixture.origin + url.pathname + url.search, { method: req.method(), headers: req.headers(), data: req.postData() || undefined });
      await route.fulfill({ response });
    });
  }
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://example.test/**', route => route.fulfill({ contentType: 'image/png', body: PREVIEW_IMAGE_PNG }));
  await page.route(`${AUTH_URL}/auth/v1/**`, route => route.fulfill({ json: route.request().url().includes('/token') ? { access_token: TOKEN, refresh_token: 'fixture-refresh-token', expires_in: 3600, user: AUTH_USER } : AUTH_USER }));
  if (surface === 'web') await page.goto(`http://127.0.0.1:${(web.address() as { port: number }).port}`);
  await page.getByLabel('아이디 또는 이메일', { exact: true }).fill('fixture-admin');
  await page.getByLabel('비밀번호', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  return {
    page, errors,
    async close() {
      if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      if (browser) { await page.unrouteAll({ behavior: 'wait' }); await browser.close(); }
      await new Promise<void>(resolve => web.close(() => resolve()));
      await fixture.close();
      await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}

async function openSingle(page: Page, fromList = false) {
  if (fromList) {
    await page.getByRole('button', { name: 'API 테스트 리스트', exact: true }).click();
    await page.getByRole('button', { name: 'API 등록', exact: true }).click();
  } else {
    await page.getByRole('button', { name: '상품 조회', exact: true }).click();
    await page.getByRole('button', { name: '저장된 상품 등록', exact: true }).click();
    await chooseOption(page.getByLabel('상품 리스트', { exact: true }), { label: 'API 테스트 리스트' });
    await page.getByRole('button', { name: '선택', exact: true }).click();
  }
  await page.getByRole('button', { name: '등록할 내용 검토', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: '소매몰 · 등록', exact: true })).toBeVisible();
  return dialog;
}

async function openBatch(page: Page) {
  await page.getByRole('button', { name: '자동 상품 등록', exact: true }).click();
  await page.getByRole('button', { name: '등록 전 검토', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '선택한 2건 검토', exact: true }).click();
  await expect(dialog.locator('.registration-preview-nav button')).toHaveCount(2);
  return dialog;
}

for (const surface of ['web', 'desktop'] as const) test(`${surface}: edit a single prepared preview without leaving it and execute only the saved replacement`, async () => {
  const fixture = await startFixture({ godomall: true });
  fixture.godomall!.tables.product_items[0].automation.detailBlocks = [{ id: 'old-detail', type: 'text', text: REGISTRATION_DETAIL_HTML }];
  const ui = await launchPreview(surface, fixture), { page } = ui;
  try {
    const dialog = await openSingle(page, true);
    const original = structuredClone(fixture.godomall!.tables.godomall_operations[0]);
    await dialog.getByRole('checkbox').check();
    await expect(dialog.getByRole('button', { name: '등록 실행', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: '등록 내용 수정', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(dialog.getByRole('button', { name: '등록 실행', exact: true })).toBeDisabled();
    await dialog.getByLabel('상품명', { exact: true }).fill('<b>미리보기에서 수정한 상품</b>');
    await dialog.getByLabel('모델명', { exact: true }).fill('EDIT_MODEL');
    await dialog.getByLabel('제조사', { exact: true }).fill('수정한 제조사');
    await dialog.getByLabel('소매 판매가', { exact: true }).fill('23400');
    await chooseOption(dialog.getByRole('combobox', { name: '원산지', exact: true }), 'Japan');
    await dialog.getByRole('tab', { name: '이미지 설정', exact: true }).click();
    await dialog.getByLabel('썸네일 URL', { exact: true }).fill('https://example.test/edited-image.jpg');
    const detailHtml = '<section><h2>수정된 상세페이지</h2><p>원문 &amp; 그대로</p></section>';
    await dialog.getByLabel('1번 텍스트 내용', { exact: true }).fill(detailHtml);
    await page.screenshot({ path: `test-results/editable-preview/${surface}-editing.png`, animations: 'disabled' });
    await dialog.getByRole('button', { name: '저장하고 미리보기 갱신', exact: true }).click();
    const preview = dialog.getByRole('region', { name: '소매몰 등록 상품 미리보기', exact: true });
    await expect(preview.getByRole('heading', { name: '미리보기에서 수정한 상품', exact: true })).toBeVisible();
    await expect(preview).toContainText('23,400원');
    await expect(preview).toContainText('EDIT_MODEL');
    await expect(preview.locator('.preview-fact').filter({ has: page.locator('dt', { hasText: /^제조사$/ }) }).locator('dd')).toHaveText('수정한 제조사');
    await expect(preview).toContainText('Made in Japan');
    await expect(preview.getByAltText('등록 상품 썸네일', { exact: true })).toHaveAttribute('src', 'https://example.test/edited-image.jpg');
    await expect(preview.frameLocator('iframe[title="등록할 PC 상세페이지"]').getByRole('heading', { name: '수정된 상세페이지', exact: true })).toBeVisible();
    await expect(dialog.getByRole('checkbox')).not.toBeChecked();
    await expect(dialog.getByRole('button', { name: '등록 실행', exact: true })).toBeDisabled();
    const source = fixture.godomall!.tables.product_items[0];
    expect(source.name_own).toBe('<b>미리보기에서 수정한 상품</b>');
    expect(source.price_retail).toBe(23400);
    expect(source.image_url).toBe('https://example.test/edited-image.jpg');
    expect(source.automation.manufacturer).toBe('수정한 제조사');
    expect(source.automation.detailBlocks[0].text).toBe(detailHtml);
    expect(source.updated_at).not.toBe(original.source_revision);
    const operations = fixture.godomall!.tables.godomall_operations;
    expect(operations).toHaveLength(2);
    expect(operations.find(operation => operation.id === original.id)).toEqual(original);
    const replacement = operations.find(operation => operation.id !== original.id)!;
    expect(replacement.source_revision).toBe(source.updated_at);
    expect(replacement.expected.goodsNm).toBe(source.name_own);
    expect(replacement.expected.goodsDescription).toBe(detailHtml);
    expect(replacement.expected.goodsDescriptionMobile).toBe(detailHtml);
    expect(fixture.godomall!.calls.filter(call => call.endpoint === 'Goods_Insert.php')).toHaveLength(0);
    await preview.locator('.preview-eyebrow').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/editable-preview/${surface}-saved-preview.png`, animations: 'disabled' });
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: '등록 실행', exact: true }).click();
    await expect(dialog.locator('.badge.success').filter({ hasText: '반영 확인 완료' })).toBeVisible();
    expect(fixture.godomall!.calls.filter(call => call.endpoint === 'Goods_Insert.php')).toHaveLength(1);
    expect(operations.find(operation => operation.id === original.id)!.state).toBe('prepared');
    expect(operations.find(operation => operation.id === replacement.id)!.state).toBe('success');
    const remote = fixture.godomall!.remote.retail.get('1000000001')!;
    expect(value(remote, 'goodsNm')).toBe(source.name_own);
    expect(value(remote, 'goodsPrice')).toBe('23400');
    expect(value(remote, 'makerNm')).toBe('수정한 제조사');
    expect(value(remote, 'goodsDescription')).toBe(detailHtml);
    expect(value(remote, 'goodsDescriptionMobile')).toBe(detailHtml);
    await dialog.getByRole('button', { name: '닫기', exact: true }).last().click();
    const savedRow = page.locator('.product-table tbody tr').first();
    await expect(savedRow.getByRole('button', { name: '미리보기에서 수정한 상품', exact: true })).toBeVisible();
    await expect(savedRow).toContainText('EDIT_MODEL');
    await expect(savedRow).toContainText('23,400');
    await expect(savedRow.getByAltText('상품 썸네일', { exact: true })).toHaveAttribute('src', 'https://example.test/edited-image.jpg');
    await expect(page.getByRole('button', { name: '저장됨', exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/editable-preview/${surface}-synced-draft-row.png`, animations: 'disabled' });
    expect(ui.errors).toEqual([]);
  } finally { await ui.close(); }
});

test('web: editing shared product data rebuilds both mall previews and clears batch confirmation', async () => {
  const fixture = await startFixture({ godomall: true });
  const ui = await launchPreview('web', fixture), { page } = ui;
  try {
    const dialog = await openBatch(page);
    const originalOperations = structuredClone(fixture.godomall!.tables.godomall_operations);
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: '등록 내용 수정', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'API로 2건 등록', exact: true })).toBeDisabled();
    await dialog.getByLabel('상품명', { exact: true }).fill('두 몰에 반영할 수정 상품');
    await dialog.getByLabel('소매 판매가', { exact: true }).fill('12345');
    await dialog.getByLabel('도매 베이직', { exact: true }).fill('6789');
    await dialog.getByRole('button', { name: '저장하고 미리보기 갱신', exact: true }).click();
    await expect(dialog.getByRole('region', { name: '소매몰 등록 상품 미리보기', exact: true }).getByRole('heading', { name: '두 몰에 반영할 수정 상품', exact: true })).toBeVisible();
    await expect(dialog.getByRole('checkbox')).not.toBeChecked();
    await expect(dialog.getByRole('button', { name: 'API로 2건 등록', exact: true })).toBeDisabled();
    const source = fixture.godomall!.tables.product_items[0];
    for (const [mall, mallName, price, brandCode, categoryCode] of [['retail', '소매몰', 12345, '001', '001001'], ['wholesale', '도매몰', 6789, '027', '002001']] as const) {
      await dialog.locator('.registration-preview-nav').getByRole('button', { name: new RegExp(mallName) }).click();
      const preview = dialog.getByRole('region', { name: `${mallName} 등록 상품 미리보기`, exact: true });
      await expect(preview.getByRole('heading', { name: '두 몰에 반영할 수정 상품', exact: true })).toBeVisible();
      await expect(preview).toContainText(`${price.toLocaleString('ko-KR')}원`);
      const rebuilt = fixture.godomall!.tables.godomall_operations.filter(operation => operation.mall_id === mall).at(-1)!;
      expect(rebuilt.source_revision).toBe(source.updated_at);
      expect(rebuilt.expected.goodsNm).toBe(source.name_own);
      expect(rebuilt.expected.goodsPrice).toBe(String(price));
      expect(rebuilt.expected.brandCd).toBe(brandCode);
      expect(rebuilt.expected.cateCd).toBe(categoryCode);
    }
    expect(fixture.godomall!.tables.godomall_operations).toHaveLength(4);
    for (const original of originalOperations) expect(fixture.godomall!.tables.godomall_operations.find(operation => operation.id === original.id)).toEqual(original);
    expect(fixture.godomall!.calls.filter(call => call.endpoint === 'Goods_Insert.php')).toHaveLength(0);
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'API로 2건 등록', exact: true }).click();
    await expect(dialog.locator('.badge.success').filter({ hasText: '반영 확인 완료' })).toHaveCount(2);
    expect(fixture.godomall!.calls.filter(call => call.endpoint === 'Goods_Insert.php').map(call => call.mall)).toEqual(['retail', 'wholesale']);
    expect(ui.errors).toEqual([]);
  } finally { await ui.close(); }
});

test('web: failed reprepare after draft save blocks stale batch execution until a complete retry', async () => {
  let failWholesale = false;
  const fixture = await startFixture({ godomall: true, respond(route) {
    if (failWholesale && route === '/godomall/wholesale/operations/prepare') throw Error('테스트: 도매몰 검증 실패');
  } });
  const ui = await launchPreview('web', fixture), { page } = ui;
  try {
    const dialog = await openBatch(page);
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: '등록 내용 수정', exact: true }).click();
    await dialog.getByLabel('상품명', { exact: true }).fill('검증 재시도할 수정 상품');
    failWholesale = true;
    await dialog.getByRole('button', { name: '저장하고 미리보기 갱신', exact: true }).click();
    await expect(dialog.getByRole('alert').filter({ hasText: '미리보기를 검증하지 못했습니다' }).first()).toBeVisible();
    expect(fixture.godomall!.tables.product_items[0].name_own).toBe('검증 재시도할 수정 상품');
    await expect(dialog.getByRole('button', { name: 'API로 2건 등록', exact: true })).toBeDisabled();
    expect(fixture.godomall!.calls.filter(call => call.endpoint === 'Goods_Insert.php')).toHaveLength(0);
    await page.screenshot({ path: 'test-results/editable-preview/reprepare-failed.png', animations: 'disabled' });
    await dialog.getByRole('button', { name: '수정 취소', exact: true }).click();
    await expect(dialog.getByRole('checkbox')).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'API로 2건 등록', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: '등록 내용 수정', exact: true }).click();
    await expect(dialog.getByLabel('상품명', { exact: true })).toHaveValue('검증 재시도할 수정 상품');
    failWholesale = false;
    await dialog.getByRole('button', { name: '저장하고 미리보기 갱신', exact: true }).click();
    await expect(dialog.getByRole('region', { name: '소매몰 등록 상품 미리보기', exact: true }).getByRole('heading', { name: '검증 재시도할 수정 상품', exact: true })).toBeVisible();
    await expect(dialog.getByRole('checkbox')).not.toBeChecked();
    await expect(dialog.getByRole('button', { name: 'API로 2건 등록', exact: true })).toBeDisabled();
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'API로 2건 등록', exact: true }).click();
    await expect(dialog.locator('.badge.success').filter({ hasText: '반영 확인 완료' })).toHaveCount(2);
    expect(fixture.godomall!.calls.filter(call => call.endpoint === 'Goods_Insert.php')).toHaveLength(2);
    expect(ui.errors).toEqual([]);
  } finally { await ui.close(); }
});

test('web: an attempted insert whose response failed cannot become a new insert through preview editing', async () => {
  const fixture = await startFixture({ godomall: true, respond(route) {
    if (/\/operations\/[^/]+\/execute$/.test(route)) throw Error('테스트: 실행 응답을 확인할 수 없음');
  } });
  const ui = await launchPreview('web', fixture), { page } = ui;
  try {
    const dialog = await openSingle(page);
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: '등록 실행', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('실행 요청은 반복하지 않습니다');
    await expect(dialog.getByRole('button', { name: '등록 실행', exact: true })).toBeDisabled();
    const snapshot = structuredClone(fixture.godomall!.tables.godomall_operations[0]);
    await dialog.getByRole('button', { name: '연결된 상품 초안 수정', exact: true }).click();
    await dialog.getByLabel('상품명', { exact: true }).fill('실행 후 별도로 수정한 리스트 초안');
    await dialog.getByRole('button', { name: '리스트 초안 저장', exact: true }).click();
    await expect(dialog.getByRole('region', { name: '소매몰 등록 상품 미리보기', exact: true })).toBeVisible();
    expect(fixture.godomall!.tables.product_items[0].name_own).toBe('실행 후 별도로 수정한 리스트 초안');
    expect(fixture.godomall!.tables.godomall_operations).toEqual([snapshot]);
    expect(fixture.calls.filter(call => call.path.endsWith('/operations/prepare'))).toHaveLength(1);
    expect(fixture.calls.filter(call => call.path.endsWith('/execute'))).toHaveLength(1);
    expect(fixture.godomall!.calls.filter(call => call.endpoint === 'Goods_Insert.php')).toHaveLength(0);
    await expect(dialog.getByRole('button', { name: '등록 실행', exact: true })).toBeDisabled();
    expect(ui.errors).toEqual([]);
  } finally { await ui.close(); }
});

test('web: a failed draft save retains edits and blocks execution without creating another prepared operation', async () => {
  let failSave = false;
  const fixture = await startFixture({ godomall: true, respond(route, method) {
    if (failSave && route === `/items/${API_ITEM}` && method === 'PUT') throw Error('테스트: 초안 저장 실패');
  } });
  const ui = await launchPreview('web', fixture), { page } = ui;
  try {
    const dialog = await openSingle(page);
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: '등록 내용 수정', exact: true }).click();
    await dialog.getByLabel('상품명', { exact: true }).fill('저장 실패 뒤에도 보존할 입력');
    failSave = true;
    await dialog.getByRole('button', { name: '저장하고 미리보기 갱신', exact: true }).click();
    await expect(dialog.getByRole('alert').filter({ hasText: '초안 저장 실패' }).first()).toBeVisible();
    await expect(dialog.getByLabel('상품명', { exact: true })).toHaveValue('저장 실패 뒤에도 보존할 입력');
    await expect(dialog.getByRole('button', { name: '등록 실행', exact: true })).toBeDisabled();
    expect(fixture.godomall!.tables.product_items[0].name_own).toBe('<b>칼라 상품 & 테스트</b>');
    expect(fixture.godomall!.tables.godomall_operations).toHaveLength(1);
    expect(fixture.godomall!.calls.filter(call => call.endpoint === 'Goods_Insert.php')).toHaveLength(0);
    failSave = false;
    await dialog.getByRole('button', { name: '저장하고 미리보기 갱신', exact: true }).click();
    await expect(dialog.getByRole('region', { name: '소매몰 등록 상품 미리보기', exact: true }).getByRole('heading', { name: '저장 실패 뒤에도 보존할 입력', exact: true })).toBeVisible();
    await expect(dialog.getByRole('checkbox')).not.toBeChecked();
    expect(fixture.godomall!.tables.godomall_operations).toHaveLength(2);
    expect(ui.errors).toEqual([]);
  } finally { await ui.close(); }
});

test('web: an uncertain historical registration permits draft correction without preparing or resending an insert', async () => {
  const fixture = await startFixture({ godomall: true });
  const response = await fixture.godomall!.request('/godomall/retail/operations/prepare', 'POST', { kind: 'insert', itemId: API_ITEM, choices: { brandCd: '001', scmNo: '1' } });
  expect(response.status).toBe(201);
  const operation = fixture.godomall!.tables.godomall_operations[0];
  Object.assign(operation, { state: 'needs_review', goods_no: '1000000001', error_message: '재조회 내용이 아직 일치하지 않습니다: PC 상세설명, 모바일 상세설명' });
  const historySnapshot = structuredClone(operation);
  const ui = await launchPreview('web', fixture), { page } = ui;
  try {
    await page.getByRole('button', { name: '상품 조회', exact: true }).click();
    await page.getByRole('button', { name: '작업 결과 보기', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('재조회 내용이 아직 일치하지 않습니다');
    await expect(dialog.getByRole('button', { name: '등록 실행', exact: true })).toHaveCount(0);
    const prepareCount = fixture.calls.filter(call => call.path.endsWith('/operations/prepare')).length;
    await dialog.getByRole('button', { name: '연결된 상품 초안 수정', exact: true }).click();
    await dialog.getByLabel('상품명', { exact: true }).fill('이력에서 바로 고친 리스트 초안');
    await dialog.getByRole('button', { name: '리스트 초안 저장', exact: true }).click();
    await expect(dialog.getByRole('region', { name: '소매몰 등록 상품 미리보기', exact: true }).getByRole('heading', { name: '칼라 상품 & 테스트', exact: true })).toBeVisible();
    expect(fixture.godomall!.tables.product_items[0].name_own).toBe('이력에서 바로 고친 리스트 초안');
    expect(fixture.godomall!.tables.godomall_operations).toHaveLength(1);
    expect(fixture.godomall!.tables.godomall_operations[0]).toEqual(historySnapshot);
    expect(fixture.calls.filter(call => call.path.endsWith('/operations/prepare'))).toHaveLength(prepareCount);
    expect(fixture.godomall!.calls.filter(call => call.endpoint === 'Goods_Insert.php')).toHaveLength(0);
    await expect(dialog.getByRole('button', { name: '등록 실행', exact: true })).toHaveCount(0);
    expect(ui.errors).toEqual([]);
  } finally { await ui.close(); }
});
