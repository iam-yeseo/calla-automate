import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startFixture, AUTH_URL, AUTH_USER, TOKEN } from './fixture';
import { threeRowImportWorkbook } from '../../../tests/fixtures/three-row-import';

test('macOS app preserves editing, account/settings screens, API status, downloads and background window', async () => {
  const fixture = await startFixture();
  const userData = await mkdtemp(path.join(os.tmpdir(), 'calla-desktop-ui-'));
  const errors: string[] = [];
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({ args: ['.'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', CALLA_DESKTOP_TEST: '1', CALLA_TEST_USER_DATA: userData, CALLA_TEST_API_ORIGIN: fixture.origin } });
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.route(`${AUTH_URL}/auth/v1/**`, route => route.fulfill({ json: route.request().url().includes('/token') ? { access_token: TOKEN, refresh_token: 'fixture-refresh-token', expires_in: 3600, user: AUTH_USER } : AUTH_USER }));
    await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible();
    await expect(page.locator('.desktop-titlebar')).toContainText('CALLA-AUTOMATE', { timeout: 30000 });
    await page.screenshot({ animations: 'disabled', path: 'test-results/desktop/login.png' });
    await page.getByLabel('아이디 또는 이메일', { exact: true }).fill('fixture-admin');
    await page.getByLabel('비밀번호', { exact: true }).fill('fixture-password');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page.getByRole('heading', { name: '등록 요청 상품', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '9월 신제품 등록', exact: true })).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: 'test-results/desktop/workspace.png' });
    expect(await page.evaluate(() => ({ node: typeof (window as any).require, desktop: !!window.callaDesktop, overflow: document.documentElement.scrollWidth > innerWidth }))).toEqual({ node: 'undefined', desktop: true, overflow: false });

    await page.getByRole('button', { name: '환경 설정', exact: true }).click();
    await expect(page.getByRole('heading', { name: '동기화', exact: true })).toBeVisible();
    await expect(page.getByLabel('연결 토큰')).toHaveCount(0);
    await expect(page.locator('.sync-status-table')).toBeVisible();
    await expect(page.locator('.sync-status-table')).toContainText('고도몰 소매');
    await expect(page.locator('.sync-status-table')).toContainText('고도몰 도매');
    await expect(page.locator('.desktop-titlebar .gnb-mall-status')).toBeVisible();
    expect(fixture.calls.some(call => call.path === '/me')).toBe(true);
    expect(fixture.calls.some(call => call.path === '/runner/registrations')).toBe(false);
    await page.screenshot({ animations: 'disabled', path: 'test-results/desktop/sync.png' });

    await page.getByRole('button', { name: '등록 요청 상품', exact: false }).first().click();
    await page.getByRole('button', { name: '9월 신제품 등록', exact: true }).click();
    await expect(page.getByRole('heading', { name: '9월 신제품 등록' })).toBeVisible();
    const openListInfo = async () => { await page.getByRole('button', { name: '리스트 정보', exact: true }).click(); await expect(page.getByRole('dialog', { name: '리스트 정보', exact: true })).toBeVisible(); };
    const closeListInfo = async () => { await page.getByRole('dialog', { name: '리스트 정보', exact: true }).getByRole('button', { name: '확인', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); };
    await openListInfo();
    const workDate = page.getByLabel('작성일', { exact: true });
    await expect(workDate).toHaveValue(/^\d{4}\/\d{2}\/\d{2}$/);
    await workDate.fill('2028/02/29');
    await workDate.press('Tab');
    await closeListInfo();
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByRole('button', { name: '저장됨', exact: true })).toBeVisible();
    expect(JSON.parse(fixture.data.get('calla-local-preview-v1')!).lists.find((list: any) => list.title === '9월 신제품 등록').work_date).toBe('2028-02-29');
    await openListInfo();
    await workDate.fill('2027/02/29');
    await expect(workDate).toHaveAttribute('aria-invalid', 'true');
    await workDate.press('Tab');
    await expect(workDate).toHaveValue('2028/02/29');
    await page.getByLabel('달력에서 날짜 선택', { exact: true }).click();
    await page.getByRole('button', { name: '2028년 선택', exact: true }).click();
    await page.getByRole('button', { name: '2026년', exact: true }).click();
    await page.getByRole('button', { name: '10월', exact: true }).click();
    await page.locator('.calla-calendar button[data-date="2026-10-02"]').click();
    await expect(workDate).toHaveValue('2026/10/02');
    await closeListInfo();
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByRole('button', { name: '저장됨', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '목록으로', exact: true }).click();
    await page.getByRole('button', { name: '9월 신제품 등록', exact: true }).click();
    await openListInfo();
    await expect(workDate).toHaveValue('2026/10/02');
    await closeListInfo();

    // The thumb appears during scrolling, then hides without moving the pointer.
    await page.mouse.move(600, 400);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1040, 650));
    const workspace = page.locator('.workspace-content');
    await expect.poll(() => workspace.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await workspace.evaluate(element => element.scrollBy(0, 100));
    await expect.poll(() => workspace.evaluate(element => element.hasAttribute('data-scrollbar-active'))).toBe(true);
    await expect.poll(() => workspace.evaluate(element => element.hasAttribute('data-scrollbar-active'))).toBe(false);
    await page.screenshot({ animations: 'disabled', path: 'test-results/desktop/date-scrollbar-idle.png' });
    await workspace.evaluate(element => element.scrollTo(0, 0));
    await page.getByRole('button', { name: '상품 추가', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // Resizing must keep the dialog centered below the Mac titlebar and every
    // footer action reachable without scrolling the window or losing the draft.
    await page.getByLabel('상품명', { exact: true }).fill('창 크기 검증 초안');
    const price = page.locator('.product-editor-modal').getByLabel('소매 판매가', {exact:true});
    await price.fill('1234567'); await expect(price).toHaveValue('1,234,567');
    await price.press('Meta+ArrowLeft'); await price.press('ArrowRight'); await price.pressSequentially('9'); await expect(price).toHaveValue('19,234,567');
    await price.fill('0'); await expect(price).toHaveValue('0'); await price.fill(''); await expect(price).toHaveValue('');
    const expectModalInWindow = async () => {
      await expect.poll(async () => page.getByRole('dialog').last().evaluate(dialog => {
        const rect = dialog.getBoundingClientRect();
        const titlebar = document.querySelector('.desktop-titlebar')!.getBoundingClientRect();
        const buttons = [...dialog.querySelectorAll<HTMLElement>('.modal-close, .modal-footer button')];
        return {
          centered: Math.abs(rect.x + rect.width / 2 - innerWidth / 2) < 2
            && Math.abs(rect.y + rect.height / 2 - (innerHeight + titlebar.bottom) / 2) < 2,
          inside: rect.top >= titlebar.bottom + 15 && rect.bottom <= innerHeight - 15,
          buttonsReachable: buttons.length > 0 && buttons.every(button => {
            const bounds = button.getBoundingClientRect();
            return bounds.top >= rect.top && bounds.bottom <= innerHeight - 15
              && bounds.left >= 0 && bounds.right <= innerWidth
              && button.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
          }),
        };
      })).toEqual({ centered: true, inside: true, buttonsReachable: true });
    };
    for (const [width, height] of [[1680, 1200], [1040, 700], [1440, 960]]) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size[0], size[1]), [width, height]);
      await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]);
      await page.screenshot({ animations: 'disabled', path: `test-results/desktop/modal-${width}x${height}.png` });
      await expectModalInWindow();
      await expect(page.getByLabel('상품명', { exact: true })).toHaveValue('창 크기 검증 초안');
    }
    await page.getByRole('dialog').locator('.modal-body').evaluate(body => { body.scrollTop = body.scrollHeight; });
    await expect(page.getByRole('dialog').locator('.modal-body')).toHaveAttribute('data-scrollbar-active', '');
    await expect(page.getByRole('dialog').locator('.modal-body')).not.toHaveAttribute('data-scrollbar-active', '');
    const modalBody = (await page.getByRole('dialog').locator('.modal-body').boundingBox())!;
    await page.mouse.move(modalBody.x + modalBody.width - 12, modalBody.y + modalBody.height / 2);
    await expect(page.getByRole('dialog').locator('.modal-body')).toHaveAttribute('data-scrollbar-active', '');
    await page.mouse.move(modalBody.x + modalBody.width / 2, modalBody.y + modalBody.height / 2);
    await expect(page.getByRole('dialog').locator('.modal-body')).not.toHaveAttribute('data-scrollbar-active', '');
    await expectModalInWindow();
    await page.getByRole('button', { name: '목록에 반영', exact: true }).click({ trial: true });
    await page.screenshot({ animations: 'disabled', path: 'test-results/desktop/product-editor.png' });
    await page.getByRole('button', { name: '취소', exact: true }).last().click();
    await page.getByRole('dialog', { name: '편집을 취소할까요?', exact: true }).getByRole('button', { name: '편집 취소', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Also open after resizing, and check a short nested dialog whose height changes.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1680, 1200));
    await page.getByRole('button', { name: '상품 추가', exact: true }).click();
    await expectModalInWindow();
    await page.getByRole('button', { name: '선택', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(2);
    await page.getByPlaceholder('브랜드 검색 · 예: AVMATRIX / ㅇㅂ').fill('없는 테스트 브랜드');
    await expectModalInWindow();
    await page.screenshot({ animations: 'disabled', path: 'test-results/desktop/modal-short-nested.png' });
    await page.getByRole('dialog').last().getByRole('button', { name: '닫기', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expectModalInWindow();
    await page.getByRole('button', { name: '취소', exact: true }).click();
    await page.getByRole('dialog', { name: '편집을 취소할까요?', exact: true }).getByRole('button', { name: '편집 취소', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 960));
    await openListInfo();
    await page.getByLabel('리스트 이름', { exact: true }).fill('맥 앱에서 수정한 리스트');
    await closeListInfo();
    await expect(page.getByRole('button', { name: '저장', exact: true })).toBeEnabled();
    await app.evaluate(({ Menu }) => { const file = Menu.getApplicationMenu()!.items.find(item => item.label === '파일')!; file.submenu!.items.find(item => item.label === '저장')!.click(); });
    await expect(page.getByRole('button', { name: '저장됨', exact: true })).toBeVisible();
    await expect.poll(async () => { const data = await fetch(fixture.origin + '/api/lists', { headers: { Authorization: `Bearer ${TOKEN}` } }).then(r => r.json()); return data.lists.some((list: any) => list.title === '맥 앱에서 수정한 리스트'); }).toBe(true);
    await page.getByRole('button', { name: '목록으로', exact: true }).click();

    for (const title of ['상품 인덱싱', '카테고리와 브랜드', '서버 이미지 폴더', '사용자 계정 관리', '자동 상품 등록']) {
      await page.getByRole('navigation', { name: '상품 운영 메뉴' }).getByRole('button', { name: title, exact: true }).click();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    }
    expect(await page.getByText('스마트스토어 자동 등록', { exact: true }).count()).toBe(0);
    await page.getByRole('button', { name: '등록 요청 상품', exact: false }).first().click();
    await page.getByRole('button', { name: '리스트 만들기', exact: true }).click();
    await page.getByLabel('리스트 이름', { exact: true }).fill('macOS 파일 불러오기 검증');
    await page.getByLabel('빈 리스트로 시작하기', { exact: true }).uncheck();
    await page.locator('dialog input[type="file"]').setInputFiles({ name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from('브랜드,품명,소매 판매가,판매가\nTEST,상품,1000,2000\n') });
    await expect(page.getByRole('alert')).toContainText('중복 열');
    await expect(page.locator('.create-list-modal').getByRole('button', { name: '리스트 만들기', exact: true })).toBeDisabled();
    const createsBeforeImport = fixture.calls.filter(call => call.method === 'POST' && call.path === '/lists').length;
    const workbook = await threeRowImportWorkbook().xlsx.writeBuffer();
    await page.locator('dialog input[type="file"]').setInputFiles({ name: 'three-row-products.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(workbook) });
    await expect(page.getByLabel('파일 인식 결과')).toContainText('6개 상품을 인식했습니다.');
    await expect(page.getByLabel('파일 인식 결과')).toContainText('상품명 없는 5개');
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(fixture.calls.filter(call => call.method === 'POST' && call.path === '/lists').length).toBe(createsBeforeImport, 'preview must not save a list');
    await page.screenshot({ animations: 'disabled', path: 'test-results/desktop/import-preview.png' });
    await page.locator('.create-list-modal').getByRole('button', { name: '리스트 만들기', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'macOS 파일 불러오기 검증' })).toBeVisible();
    await expect(page.getByRole('button', { name: '상품명 없음', exact: true })).toHaveCount(5);
    await expect(page.getByRole('button', { name: '머리글 검증 상품', exact: true })).toBeVisible();
    const importedListId = new URL(page.url()).searchParams.get('list');
    const savedImport = await fetch(`${fixture.origin}/api/lists/${importedListId}/items`, { headers: { Authorization: `Bearer ${TOKEN}` } }).then(response => response.json());
    expect(savedImport.items).toHaveLength(6);
    expect(savedImport.items[0]).toMatchObject({ name_own: '머리글 검증 상품', name_naver: '검색용 상품명', content: '신규', price_retail: 85000, price_wholesale: null, price_wholesale_master: 68000 });
    expect(savedImport.items[1]).toMatchObject({ name_own: '', model: 'MODEL-2', price_wholesale: 60000, price_wholesale_master: 0 });
    expect(fixture.calls.some(call => call.method === 'PUT' && call.path.endsWith('/draft'))).toBe(true);
    const exportFile = path.join(userData, 'products.json');
    await app.evaluate(({ session }, filename) => { session.defaultSession.once('will-download', (_event, item) => item.setSavePath(filename)); }, exportFile);
    await page.getByRole('button', { name: 'JSON 내보내기', exact: true }).click();
    await expect.poll(async () => { try { return JSON.parse(await readFile(exportFile, 'utf8')).items.length; } catch { return 0; } }).toBeGreaterThan(0);

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    expect(await app.evaluate(({ BrowserWindow }) => ({ windows: BrowserWindow.getAllWindows().length, visible: BrowserWindow.getAllWindows()[0].isVisible() }))).toEqual({ windows: 1, visible: false });
    await app.evaluate(({ app }) => app.emit('activate'));
    await expect(page.getByRole('heading', { name: 'macOS 파일 불러오기 검증' })).toBeVisible();
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'macOS 파일 불러오기 검증' })).toBeVisible();
    const encrypted = await readFile(path.join(userData, 'session.enc'));
    expect(encrypted.includes(Buffer.from(TOKEN))).toBe(false);
    expect(encrypted.includes(Buffer.from('fixture-refresh-token'))).toBe(false);
    expect(errors).toEqual([]);
    await app.close(); app = undefined;
  } finally {
    if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); }
    await fixture.close();
    await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
