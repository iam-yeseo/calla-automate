import { chooseOption } from './select-control';
import { test, expect, chromium, _electron as electron, type Browser, type ElectronApplication, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startFixture, AUTH_URL, AUTH_USER, TOKEN } from './fixture';
import { API_LIST, sourceProduct } from '../../../tests/fixtures/godomall';
import type { Product } from '../../../src/types';

for (const surface of ['web', 'desktop'] as const) test(`${surface}: October update: prefix, repeat categories, guarded close, sidebar and list shortcut`, async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'calla-product-workflow-'));
  const list = { id: API_LIST, title: '상품 개선 검증', author: '검증', work_date: '2026-10-07', created_at: '2026-10-07T00:00:00Z', total: 1 };
  let products: Product[] = Array.from({ length: 1 }, (_, i) => ({ ...sourceProduct(), id: `22222222-2222-4222-8222-${String(i + 1).padStart(12, '0')}`, seq: i + 1, name_own: '<font color="#EF4036">[중고상품]</font> 검증 상품', done: i === 24 }));
  const errors: string[] = [], writes: string[] = [];
  const fixture = await startFixture({ godomall: true, respond: (route, method, body) => {
    if (method !== 'GET') writes.push(`/api${route}`);
    if (route === '/settings') return { value: { schemaVersion: 1, folders: ['audio'], brands: [], brandsByMall: { retail: [{code:'001',name:'CALLA'}], wholesale: [{code:'027',name:'CALLA'}] }, categories: { retail: [{code:'001',name:'소매 분류',parentCode:''},{code:'001001',name:'소매 하위',parentCode:'001'},{code:'001002',name:'소매 추가',parentCode:'001'}], wholesale: [{code:'002',name:'도매 분류',parentCode:''},{code:'002001',name:'도매 하위',parentCode:'002'}] } }, updated_at: '2026-10-21T00:00:00Z' };
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
    await expect(page.locator('.sidebar-heading')).toHaveText(['상품 등록','상품 조회 및 수정','등록 설정','일반 설정']);
    await expect(page.locator('.workspace-toggle')).not.toContainText('상품 운영');
    await expect(table.locator('.product-name-prefix')).toHaveText('[중고상품]');
    await expect(table.locator('.product-name-prefix')).toHaveCSS('color','rgb(239, 64, 54)');
    await table.getByRole('button',{name:'[중고상품] 검증 상품',exact:true}).click();
    const editor=page.getByRole('dialog',{name:'상품 편집',exact:true});
    await expect(editor.getByRole('checkbox',{name:'머리말 사용',exact:true})).toBeChecked();
    await expect(editor.getByLabel('상품명 머리말')).toHaveValue('[중고상품]');
    await expect(editor.getByLabel('상품명',{exact:true})).toHaveValue('검증 상품');
    await editor.getByRole('checkbox',{name:'머리말 사용',exact:true}).uncheck();
    await expect(editor.getByLabel('상품명 머리말')).toBeDisabled();
    await editor.getByRole('checkbox',{name:'머리말 사용',exact:true}).check();
    await editor.getByLabel('상품명 머리말').fill('[예약판매]');
    const columns=editor.locator('.editor-mall-category-column');
    for(const code of ['001','001002']) {
      await columns.first().getByRole('button',{name:'카테고리 추가',exact:true}).click();
      const picker=page.getByRole('dialog',{name:'카테고리 선택',exact:true});
      await picker.getByRole('option').filter({has:page.locator('small',{hasText:new RegExp('^'+code+'$')})}).click();
      await picker.getByRole('button',{name:'선택',exact:true}).click();
      await expect(picker).toBeHidden();
    }
    await expect(columns.first().locator('.editor-category-row')).toHaveCount(3);
    await columns.first().getByRole('button',{name:'카테고리 추가',exact:true}).click();
    const duplicatePicker=page.getByRole('dialog',{name:'카테고리 선택',exact:true});
    await expect(duplicatePicker.getByRole('option').first()).toBeDisabled();
    await duplicatePicker.getByRole('button',{name:'취소',exact:true}).click();
    const emptyRemove=columns.first().getByRole('button',{name:'소매 카테고리 4 제거',exact:true});
    if(await emptyRemove.count())await emptyRemove.click();
    await mkdir('test-results/update-067',{recursive:true});
    await editor.locator('.modal-body').evaluate(node=>{node.scrollTop=0;});
    await page.screenshot({path:`test-results/update-067/${surface}-editor.png`,animations:'disabled'});
    // An accidental backdrop click keeps the draft until the explicit discard action.
    await page.mouse.click(8,8);
    const guard=page.getByRole('dialog',{name:'편집을 취소할까요?',exact:true});
    await expect(guard).toBeVisible();
    await page.screenshot({path:`test-results/update-067/${surface}-close-confirm.png`,animations:'disabled'});
    await guard.getByRole('button',{name:'계속 편집',exact:true}).click();
    await expect(guard).toBeHidden();
    await expect(editor.getByLabel('상품명 머리말')).toHaveValue('[예약판매]');
    const draftWrites=()=>writes.filter(url=>url.endsWith('/draft')).length;
    const shortcut=async()=>{if(app)await app.evaluate(({Menu})=>{const item=Menu.getApplicationMenu()!.items.find(item=>item.label==='파일')!.submenu!.items.find(item=>item.label==='저장')!;if(item.accelerator!=='Cmd+S')throw Error('Missing save accelerator');item.click();});else await page.keyboard.press('Meta+s');};
    await shortcut();
    expect(draftWrites()).toBe(0);
    await expect(editor).toBeVisible();
    await editor.getByRole('button',{name:'목록에 반영',exact:true}).click();
    await expect(editor).toBeHidden();
    await expect(table.locator('.product-name-prefix')).toHaveText('[예약판매]');
    await shortcut();
    await expect(page.getByRole('button',{name:'저장됨',exact:true})).toBeVisible();
    expect(draftWrites()).toBe(1);
    expect(products[0].name_own).toBe('<font color="#EF4036">[예약판매]</font> 검증 상품');
    expect(products[0].automation.categoryCodes.retail).toBe('001001');
    expect(products[0].automation.categorySelections?.retail).toEqual(['001001','001','001002']);
    await page.screenshot({path:`test-results/update-067/${surface}-saved-list.png`,animations:'disabled'});
    // Removing the first category promotes the next one and survives saving.
    await table.getByRole('button',{name:'[예약판매] 검증 상품',exact:true}).click();
    await editor.getByRole('button',{name:'소매 카테고리 1 제거',exact:true}).click();
    await editor.getByRole('button',{name:'목록에 반영',exact:true}).click();
    await shortcut();
    await expect(page.getByRole('button',{name:'저장됨',exact:true})).toBeVisible();
    expect(products[0].automation.categoryCodes.retail).toBe('001');
    expect(products[0].automation.categorySelections?.retail).toEqual(['001','001002']);
    await table.getByRole('button',{name:'[예약판매] 검증 상품',exact:true}).click();
    await editor.getByLabel('상품명',{exact:true}).fill('폐기할 수정');
    await page.keyboard.press('Escape');
    await expect(guard).toBeVisible();
    await guard.getByRole('button',{name:'편집 취소',exact:true}).click();
    await expect(editor).toBeHidden();
    await expect(table).not.toContainText('폐기할 수정');
    expect(writes.filter(url=>!url.endsWith('/auth/login')&&!url.endsWith('/draft'))).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    if(app)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});
    if(browser){await page!.unrouteAll({behavior:'wait'});await browser.close();}
    if(web.listening)await new Promise<void>(resolve=>web.close(()=>resolve()));
    await fixture.close();
    await rm(userData,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});
