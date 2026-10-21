import { chooseOption } from './select-control';
import { test, expect, _electron as electron, chromium, type Page, type ElectronApplication, type Browser } from '@playwright/test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { startFixture, AUTH_URL, AUTH_USER, TOKEN, REGISTRATION_DETAIL_HTML, REGISTRATION_PRODUCT_NAME, PREVIEW_IMAGE_PNG } from './fixture';
import { value } from '../../../server/godomall-xml';
import type { GodomallOperation } from '../../../src/godomall-types';

for (const scenario of ['web', 'desktop', 'uncertain', 'optional', 'legacy'] as const) test(`${scenario}: storefront batch review preserves prepared mall values and never sends an unconfirmed or repeated registration`, async () => {
  const prepareChoices: Record<string, unknown>[] = [];
  let releaseWholesale!: () => void;
  const wholesaleGate = new Promise<void>(resolve => { releaseWholesale = resolve; });
  const fixture = await startFixture({ godomall: true, respond: (route, _method, body) => {
    if (route.endsWith('/operations/prepare')) prepareChoices.push(JSON.parse(body).choices);
    return undefined;
  }, mapResponse: (route, _method, result) => {
    if (scenario !== 'legacy' || !route.startsWith('/godomall/')) return;
    const response = result as { operation?: GodomallOperation };
    if (response.operation?.kind !== 'insert') return;
    const { product_preview: _preview, ...operation } = response.operation;
    operation.changes = operation.changes.map(({ field, label, before, after }) => ({ field, label, before, after }));
    return { ...response, operation };
  } });
  fixture.godomall!.tables.product_items[0].name_own = REGISTRATION_PRODUCT_NAME;
  fixture.godomall!.tables.product_items[0].automation.detailBlocks = [{ id: 'preview-html', type: 'text', text: REGISTRATION_DETAIL_HTML }];
  if (scenario === 'optional') {
    const product = fixture.godomall!.tables.product_items[0];
    product.image_url = ''; product.automation.detailBlocks = []; product.automation.detailImages = []; product.automation.detailHtml = '';
    product.price_wholesale_master = 700; product.model = 'PF12+MK2';
  }
  const userData = await mkdtemp(path.join(os.tmpdir(), 'calla-api-workflow-'));
  let app: ElectronApplication | undefined, browser: Browser | undefined, page: Page;
  const errors: string[] = [];
  const web = createServer(async (req, res) => {
    const pathname = new URL(req.url || '/', 'http://local').pathname;
    const file = pathname.startsWith('/assets/') ? path.resolve('dist', pathname.slice(1)) : path.resolve('dist/index.html');
    try { const data = await readFile(file); res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html'); res.end(data); } catch { res.statusCode = 404; res.end(); }
  });
  try {
    if (scenario === 'desktop') { app = await electron.launch({ args: ['.'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', CALLA_DESKTOP_TEST: '1', CALLA_TEST_USER_DATA: userData, CALLA_TEST_API_ORIGIN: fixture.origin } }); page = await app.firstWindow(); }
    else { await new Promise<void>(resolve => web.listen(0, '127.0.0.1', resolve)); browser = await chromium.launch({ channel: 'chrome' }); page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.route('**/api/**', async route => { const req = route.request(), url = new URL(req.url()); const response = await page.request.fetch(fixture.origin + url.pathname + url.search, { method: req.method(), headers: req.headers(), data: req.postData() || undefined }); if (scenario === 'web' && /\/godomall\/wholesale\/operations\/[^/]+\/execute$/.test(url.pathname)) await wholesaleGate; await route.fulfill({ response }); });
    }
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://example.test/**', route => route.fulfill({ contentType: 'image/png', body: PREVIEW_IMAGE_PNG }));
    await page.route(`${AUTH_URL}/auth/v1/**`, route => route.fulfill({ json: route.request().url().includes('/token') ? { access_token: TOKEN, refresh_token: 'fixture-refresh-token', expires_in: 3600, user: AUTH_USER } : AUTH_USER }));
    if (scenario !== 'desktop') await page.goto(`http://127.0.0.1:${(web.address() as { port: number }).port}`);
    await page.getByLabel('아이디 또는 이메일', { exact: true }).fill('fixture-admin'); await page.getByLabel('비밀번호', { exact: true }).fill('fixture-password'); await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.getByRole('button', { name: '카테고리와 브랜드', exact: true }).click();
    await page.getByRole('tab', { name: '브랜드', exact: true }).click();
    await expect(page.getByRole('cell', { name: '001', exact: true })).toBeVisible();
    await chooseOption(page.getByLabel('쇼핑몰', { exact: true }), 'wholesale'); await expect(page.getByRole('cell', { name: '027', exact: true })).toBeVisible(); await expect(page.getByRole('cell', { name: '001', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '브랜드 추가', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: '카테고리 추가', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '도매 브랜드 업데이트', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '자동 상품 등록', exact: true }).click();
    await expect(page.getByText('로컬 실행기 연결이 필요합니다')).toHaveCount(0);
    await page.getByRole('button', { name: '등록 전 검토', exact: true }).click();
    const modal = page.getByRole('dialog').last();
    await expect(modal.locator('.registration-review-table tbody tr')).toHaveCount(2);
    const defaults = modal.locator('.registration-defaults');
    await expect(defaults).toHaveAttribute('aria-label', '자동 적용되는 배송·이용안내');
    await expect(defaults.locator('dt')).toHaveText(['소매몰 배송 설정', '도매몰 배송 설정', '배송안내', 'AS안내', '환불안내']);
    await expect(defaults.locator('dd')).toHaveText(['배송방법', '칼라배송', '배송안내 - 기본', 'AS안내 - 기본', '환불안내 - 기본']);
    await expect(modal.getByRole('combobox', { name: /배송|AS안내|환불안내|공급사/ })).toHaveCount(0);
    await expect(modal.getByLabel('칼라 상품 & 테스트 소매몰 브랜드', { exact: true })).toContainText('CALLA (001)');
    await expect(modal.getByLabel('칼라 상품 & 테스트 도매몰 브랜드', { exact: true })).toContainText('CALLA (027)');
    await expect(modal.getByRole('checkbox', { name: '등록 가능한 상품 전체 선택', exact: true })).toBeChecked();
    if (scenario === 'optional') { await expect(modal.getByRole('checkbox')).toHaveCount(3); await expect(modal.getByRole('button', { name: '선택한 2건 검토', exact: true })).toBeEnabled(); }
    await modal.getByRole('checkbox', { name: '칼라 상품 & 테스트 소매몰 선택', exact: true }).uncheck();
    expect(await modal.getByRole('checkbox', { name: '등록 가능한 상품 전체 선택', exact: true }).evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true);
    await modal.getByRole('checkbox', { name: '등록 가능한 상품 전체 선택', exact: true }).check();
    await page.screenshot({ path: `test-results/api-workflow-040/${scenario}-review-table.png`, animations: 'disabled' });
    await modal.getByRole('button', { name: '선택한 2건 검토', exact: true }).click();
    await expect(modal.getByRole('button', { name: 'API로 2건 등록', exact: true })).toBeDisabled();
    expect(prepareChoices).toEqual([{ brandCd: '001', scmNo: '1' }, { brandCd: '027', scmNo: '1' }]);
    expect(fixture.calls.filter(call => /\/codes\?kind=(deliveryInfo|asInfo|refundInfo)$/.test(call.path))).toHaveLength(0);
    if (scenario !== 'legacy') expect(fixture.calls.filter(call => /\/codes\?kind=delivery$/.test(call.path))).toHaveLength(0);
    expect(fixture.godomall!.calls.filter(c => c.endpoint === 'Goods_Insert.php')).toHaveLength(0);
    await expect(modal.locator('.registration-preview-nav button')).toHaveCount(2);
    for (const [mall, mallName, price, categoryCode, brandCode, shippingName] of [
      ['retail', '소매몰', 1000, '001001', '001', '배송방법'],
      ['wholesale', '도매몰', 800, '002001', '027', '칼라배송'],
    ] as const) {
      await modal.locator('.registration-preview-nav').getByRole('button', { name: new RegExp(mallName) }).click();
      const preview = modal.getByRole('region', { name: `${mallName} 등록 상품 미리보기`, exact: true });
      await expect(preview).toBeVisible();
      await expect(preview.getByRole('heading', { name: '칼라 상품 & 테스트', exact: true })).toBeVisible();
      const formattedName = preview.getByRole('heading', { name: '칼라 상품 & 테스트', exact: true }).locator('b');
      await expect(formattedName).toHaveText('칼라 상품 & 테스트');
      expect(await formattedName.getAttribute('onclick')).toBeNull();
      await formattedName.click();
      await expect(page.locator('body')).not.toHaveAttribute('data-preview-name-script-ran', 'yes');
      await expect(preview).toContainText(`${price.toLocaleString('ko-KR')}원`);
      await expect(preview).toContainText('CALLA');
      await expect(preview).toContainText(categoryCode);
      await expect(preview).toContainText(brandCode);
      await expect(preview).toContainText('Made in Korea');
      await expect(preview).toContainText(scenario === 'optional' ? 'PF12+MK2' : 'MODEL_1');
      await expect(preview.locator('.preview-product-facts dt')).toHaveText(['브랜드', '카테고리', '모델명', '제조사', '원산지', '배송비']);
      await expect(preview.locator('.preview-fact').filter({ has: page.locator('dt', { hasText: /^제조사$/ }) }).locator('dd')).toHaveText('CALLA');
      await expect(preview).toContainText(shippingName);
      await expect(preview.locator('.preview-shipping-amount')).toHaveText('4,000원');
      await expect(preview).toContainText('100,000원 이상 무료배송');
      await expect(preview.locator('.preview-shipping-policy')).toHaveAttribute('data-policy-source', scenario === 'legacy' ? 'current-policy' : 'prepared-snapshot');
      await preview.getByText('배송 방식·추가요금', { exact: true }).click();
      if (mall === 'wholesale') {
        await expect(preview).toContainText('본사로 배송');
        await expect(preview).toContainText('고객 직배송');
      }
      if (scenario === 'legacy') await expect(preview).toContainText('이전 작업의 배송 금액은 현재 확인된 정책을 기준으로 표시합니다.');
      if (scenario === 'web' || scenario === 'desktop') {
        await preview.locator('.preview-shipping-policy').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `test-results/product-preview-060/${scenario}-${mall}-shipping.png`, animations: 'disabled' });
      }
      await preview.getByText('배송 방식·추가요금', { exact: true }).click();
      const stored = fixture.godomall!.tables.godomall_operations.find(operation => operation.mall_id === mall)!;
      expect(Number(stored.expected.goodsPrice)).toBe(price);
      expect(stored.expected.brandCd).toBe(brandCode);
      expect(stored.expected.cateCd).toBe(categoryCode);
      if (scenario !== 'optional') {
        await expect(preview.getByAltText('등록 상품 썸네일', { exact: true })).toHaveAttribute('src', stored.expected.listImageData);
        await expect.poll(() => preview.getByAltText('등록 상품 썸네일', { exact: true }).evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(80);
        for (const [tab, title] of [['PC 상세페이지', '등록할 PC 상세페이지'], ['모바일 상세페이지', '등록할 모바일 상세페이지']] as const) {
          await preview.getByRole('tab', { name: tab, exact: true }).click();
          const frame = preview.getByTitle(title, { exact: true });
          await expect(frame).toHaveAttribute('sandbox', '');
          await expect(frame).toHaveAttribute('srcdoc', new RegExp('상세페이지 마지막 확인'));
          expect(await frame.getAttribute('srcdoc')).toContain(stored.expected[tab === 'PC 상세페이지' ? 'goodsDescription' : 'goodsDescriptionMobile']);
          const contents = preview.frameLocator(`iframe[title="${title}"]`);
          await expect(contents.getByRole('heading', { name: '등록할 상세설명', exact: true })).toBeVisible();
          await expect.poll(() => contents.getByAltText('등록 상세 이미지', { exact: true }).evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(80);
          await expect(contents.locator('html')).not.toHaveAttribute('data-preview-script-ran', 'yes');
          if ((scenario === 'web' || scenario === 'desktop') && tab === '모바일 상세페이지') await page.screenshot({ path: `test-results/product-preview-060/${scenario}-${mall}-mobile-detail.png`, animations: 'disabled' });
          await contents.getByText('상세페이지 마지막 확인', { exact: true }).scrollIntoViewIfNeeded();
          await expect(contents.getByText('상세페이지 마지막 확인', { exact: true })).toBeVisible();
          if ((scenario === 'web' || scenario === 'desktop') && tab === 'PC 상세페이지') await page.screenshot({ path: `test-results/product-preview-060/${scenario}-${mall}-detail-bottom.png`, animations: 'disabled' });
        }
        await preview.getByRole('tab', { name: 'PC 상세페이지', exact: true }).click();
      } else {
        await expect(preview.getByText('등록할 썸네일이 없습니다.', { exact: true })).toBeVisible();
        await expect(preview.getByText('등록할 상세페이지가 없습니다.', { exact: true })).toBeVisible();
        await expect(preview.locator('iframe')).toHaveCount(0);
      }
      await expect(page.locator('body')).not.toHaveAttribute('data-preview-script-ran', 'yes');
      await preview.locator('.preview-eyebrow').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/product-preview-060/${scenario}-${mall}-review.png`, animations: 'disabled' });
    }
    await expect(modal.getByRole('button', { name: 'API로 2건 등록', exact: true })).toBeDisabled();
    expect(fixture.godomall!.calls.filter(c => c.endpoint === 'Goods_Insert.php')).toHaveLength(0);
    if (scenario === 'uncertain') { fixture.godomall!.modes.insert = 'timeout-after-create'; fixture.godomall!.modes.failSearch = true; }
    await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: 'API로 2건 등록', exact: true }).click();
    await expect(modal.getByRole('heading', { name: 'API 등록 결과', exact: true })).toBeVisible();
    if (scenario === 'web') {
      await expect(modal.getByRole('progressbar', { name: '상품 등록 진행률' })).toHaveAttribute('aria-valuenow', '50');
      await expect(modal.locator('.calla-progress')).toContainText('1 / 2건 반영 확인');
      await page.screenshot({ path: 'test-results/update-261021/web-registration-halfway.png', animations: 'disabled' });
      releaseWholesale();
    }
    if (scenario === 'uncertain') {
      await expect(modal.locator('.badge.warning').filter({ hasText: '결과 확인 필요' })).toBeVisible({ timeout: 20000 });
      expect(fixture.godomall!.calls.filter(c => c.endpoint === 'Goods_Insert.php')).toHaveLength(1);
      await expect(modal.getByRole('progressbar', { name: '상품 등록 진행률' })).toHaveAttribute('aria-valuenow', '0');
      await expect(modal.locator('.calla-progress')).toContainText('등록을 중단했습니다');
      await page.screenshot({ path: 'test-results/update-261021/uncertain-registration-progress.png', animations: 'disabled' });
      await modal.getByRole('button', { name: '작업 결과', exact: true }).first().click();
      const result = page.getByRole('dialog').last(); await expect(result.getByRole('button', { name: '등록 실행', exact: true })).toHaveCount(0);
      await result.getByRole('button', { name: '작업 상태 다시 조회', exact: true }).click();
      await expect(result.getByRole('button', { name: '작업 상태 다시 조회', exact: true })).toBeEnabled();
      expect(fixture.godomall!.calls.filter(c => c.endpoint === 'Goods_Insert.php')).toHaveLength(1);
    } else {
      await expect(modal.locator('.badge.success').filter({ hasText: '반영 확인 완료' })).toHaveCount(2);
      await expect(modal.getByRole('progressbar', { name: '상품 등록 진행률' })).toHaveAttribute('aria-valuenow', '100');
      await expect(modal.locator('.calla-progress')).toContainText('2 / 2건 반영 확인');
      await page.screenshot({ path: `test-results/update-261021/${scenario}-registration-progress.png`, animations: 'disabled' });
      const inserts = fixture.godomall!.calls.filter(c => c.endpoint === 'Goods_Insert.php'); expect(inserts.map(c => c.mall)).toEqual(['retail', 'wholesale']);
      const operations = fixture.godomall!.tables.godomall_operations;
      expect(operations.find(op => op.mall_id === 'retail')!.expected.brandCd).toBe('001'); expect(operations.find(op => op.mall_id === 'wholesale')!.expected.brandCd).toBe('027');
      for (const [mall, shipping, guides] of [['retail', '1', ['002001', '003001', '004001']], ['wholesale', '10', ['002091', '003091', '004091']]] as const) {
        const payload = fixture.godomall!.remote[mall].get('1000000001')!;
        expect(value(payload, 'deliverySno')).toBe(shipping);
        expect(['detailInfoDelivery', 'detailInfoAS', 'detailInfoRefund'].map(field => value(payload, field))).toEqual(guides);
      }
      await page.screenshot({ path: `test-results/api-workflow-040/${scenario}-batch-result.png`, animations: 'disabled' });
    }
    expect(fixture.calls.filter(c => c.path.startsWith('/runner/'))).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false); expect(errors).toEqual([]);
    if (app) expect(await app.evaluate(({ app }) => app.getAppMetrics().some(p => /runner/i.test(p.name || '')))).toBe(false);
  } finally { releaseWholesale(); if (app) await app.evaluate(({app}) => app.exit(0)).catch(() => {}); if (browser) { await page!.unrouteAll({ behavior: 'wait' }); await browser.close(); } await new Promise<void>(resolve => web.close(() => resolve())); await fixture.close(); await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
});
