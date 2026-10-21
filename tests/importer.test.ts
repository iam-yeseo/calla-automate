import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { downloadTemplate, importProducts, inspectProductImport } from '../src/importer.ts';
import { threeRowImportWorkbook } from './fixtures/three-row-import.ts';
import { canRun, core } from '../src/domain.ts';

const LIST = '11111111-1111-4111-8111-111111111111';
const csv = (text: string, name = 'products.csv') => new File([text], name, { type: 'text/csv' });
async function xlsx(workbook: ExcelJS.Workbook): Promise<File> {
  const data = await workbook.xlsx.writeBuffer();
  return new File([new Uint8Array(data as ArrayBuffer)], 'products.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

test('CSV preserves quoted commas/newlines, integer zero, null prices, HTML names and app sequence', async () => {
  const input = '\uFEFF브랜드,품명,모델명,소매 정가,소매 판매가,도매 베이직,도매 마스터,링크,비고\r\n' +
    'TEST,"<b>상품, 이름</b>",M-1,,"1,200",0,-,https://example.com/item,"첫 줄\n두 번째 ""줄"""\r\n' +
    'TEST,두 번째 상품,M-2,₩2000원,1500,,,,\r\n';
  const result = await importProducts(csv(input), LIST, 7);
  assert.equal(result.length, 2);
  assert.equal(result[0]!.name_own, '<b>상품, 이름</b>');
  assert.equal(result[0]!.price_retail, 1200);
  assert.equal(result[0]!.price_retail_regular, null);
  assert.equal(result[0]!.price_wholesale, 0);
  assert.equal(result[0]!.price_wholesale_master, null);
  assert.equal(result[0]!.note, '첫 줄\n두 번째 "줄"');
  assert.equal(result[0]!.seq, 7);
  assert.equal(result[1]!.seq, 8);
  assert.equal(result[1]!.price_retail_regular, 2000);
  assert.equal(result[0]!.list_id, LIST);
  assert.equal(result[0]!.done, false);
  assert.notEqual(result[0]!.id, result[1]!.id);
});

test('XLSX first sheet supports real merged 2-row headers, rich text, cached formulas and hyperlinks', async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('등록 리스트');
  sheet.addRow(['신제품 작업 리스트']);
  sheet.addRow(['브랜드', '품명', null, '모델명', '가격', null, null, '링크']);
  sheet.addRow([null, '자사몰', '스마트스토어', null, '소매 판매가', '도매 베이직', '도매 마스터']);
  sheet.mergeCells('A2:A3'); sheet.mergeCells('B2:C2'); sheet.mergeCells('D2:D3'); sheet.mergeCells('E2:G2'); sheet.mergeCells('H2:H3');
  sheet.addRow(['TEST', { richText: [{ text: '상품 ' }, { text: '이름', font: { bold: true } }] }, '네이버 이름', 'M-1', { formula: '1000+200', result: 1200 }, 1000, 900, { text: '제품 페이지', hyperlink: 'https://example.com/product' }]);
  sheet.getCell('A4').note = '공급사 메모';
  wb.definedNames.add("'등록 리스트'!$A$4:$D$4", 'product_labels');
  wb.addWorksheet('다른 시트').addRow(['이 시트는 읽지 않습니다']);
  const [product] = await importProducts(await xlsx(wb), LIST, 1);
  assert.equal(product!.name_own, '상품 이름');
  assert.equal(product!.name_naver, '네이버 이름');
  assert.equal(product!.price_retail, 1200);
  assert.equal(product!.price_wholesale, 1000);
  assert.equal(product!.price_wholesale_master, 900);
  assert.equal(product!.ref_link, 'https://example.com/product');
  assert.equal(product!.brand, 'TEST');
});

test('numeric errors do not silently truncate commas, negatives, decimals or multiple prices', async () => {
  for (const value of ['1,2', '-200', '1.5', '100/200', '가격문의', '999999999999999999']) {
    await assert.rejects(importProducts(csv(`브랜드,품명,소매 판매가\nTEST,상품,"${value}"`), LIST, 1), /2행.*소매 판매가.*가격/);
  }
});

test('blank rows are skipped, identified unnamed drafts are kept, and unidentifiable rows fail', async () => {
  const items = await importProducts(csv('브랜드,품명,모델명\n,,\nTEST,상품,M-1\n'), LIST, 1);
  assert.equal(items.length, 1);
  const result = await inspectProductImport(csv('브랜드,품명,모델명\nTEST,상품,M-1\nTEST,,M-2'), LIST, 1);
  assert.equal(result.products.length, 2);
  assert.equal(result.products[1]!.name_own, '');
  assert.equal(result.products[1]!.model, 'M-2');
  assert.deepEqual(result.missingNameRows, [3]);
  await assert.rejects(importProducts(csv('브랜드,품명,모델명\nTEST,상품,M-1\nTEST,,'), LIST, 1), /3행.*품명/);
});

test('three-level merged request headers separate names, channels and wholesale tiers without losing incomplete products', async () => {
  const result = await inspectProductImport(await xlsx(threeRowImportWorkbook()), LIST, 7);
  assert.equal(result.sheetName, '등록 요청');
  assert.deepEqual(result.headerRows, [3, 4, 5]);
  assert.deepEqual(result.missingNameRows, [7, 8, 9, 10, 11]);
  assert.equal(result.products.length, 6);
  assert.deepEqual(result.products.map(product => product.seq), [7, 8, 9, 10, 11, 12]);
  const [first, second, , fourth] = result.products;
  assert.equal(first!.name_own, '머리글 검증 상품');
  assert.equal(first!.name_naver, '검색용 상품명');
  assert.equal(first!.brand, 'TEST');
  assert.equal(first!.model, 'MODEL-1');
  assert.equal(first!.content, '신규');
  assert.equal(first!.image_usage, '브랜드 본사\n홈페이지');
  assert.equal(first!.note, '원본 메모');
  assert.equal(first!.ref_link, 'https://example.com/item/1');
  assert.equal(first!.price_retail, 85000);
  assert.equal(first!.price_wholesale, null);
  assert.equal(first!.price_wholesale_master, 68000);
  assert.equal(first!.price_naver, 85000);
  assert.deepEqual([first!.need_retail, first!.need_wholesale, first!.need_naver], ['불필요', '필요', '필요']);
  assert.equal(second!.price_wholesale, 60000);
  assert.equal(second!.price_wholesale_master, 0);
  assert.deepEqual([second!.need_retail, second!.need_wholesale, second!.need_naver], ['필요', '불필요', '불필요']);
  assert.equal(fourth!.price_retail, null);
  assert.equal(fourth!.price_naver, null);
  const settings = core.normalizeSettings({ schemaVersion: 1, folders: [], brands: [], categories: { retail: [], wholesale: [] } });
  assert.ok(core.readyIssues(second!, settings).includes('자사몰 상품명 미입력'));
  assert.equal(canRun(second!, [], settings), false, 'an imported draft must not register with a missing name');
});

test('merged header continuation without new labels is skipped while a real product containing header words is kept', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('상품');
  sheet.addRow(['브랜드', '품명', '모델명', '소매 판매가']);
  for (const column of ['A', 'B', 'C', 'D']) sheet.mergeCells(`${column}1:${column}2`);
  sheet.getRow(3).values = ['TEST', '기본 소매 상품', 'MASTER', 1000];
  const result = await inspectProductImport(await xlsx(workbook), LIST, 1);
  assert.deepEqual(result.headerRows, [1, 2]);
  assert.equal(result.products[0]!.name_own, '기본 소매 상품');
  assert.equal(result.products[0]!.model, 'MASTER');
});

test('invalid prices after multi-level headers still report the original product row and exact tier', async () => {
  const workbook = threeRowImportWorkbook();
  workbook.worksheets[0]!.getCell('M7').value = '1,2';
  await assert.rejects(importProducts(await xlsx(workbook), LIST, 1), /7행.*가격 \/ 도매몰 \/ 마스터.*가격/);
});

test('missing formula results and Excel error values give actionable cell errors', async () => {
  for (const cell of [{ formula: '1+1' }, { error: '#VALUE!' }]) {
    const wb = new ExcelJS.Workbook(); const sheet = wb.addWorksheet('상품');
    sheet.addRow(['브랜드', '품명', '소매 판매가']);
    sheet.addRow(['TEST', '상품', cell]);
    await assert.rejects(importProducts(await xlsx(wb), LIST, 1), /2행.*소매 판매가.*(수식|오류)/);
  }
});

test('all supported registration flags map exactly and unknown values fail', async () => {
  const items = await importProducts(csv('브랜드,품명,소매 등록,도매 등록,네이버 등록\nTEST,상품,O,X,불필요'), LIST, 1);
  assert.equal(items[0]!.need_retail, '필요');
  assert.equal(items[0]!.need_wholesale, '불필요');
  assert.equal(items[0]!.need_naver, '불필요');
  await assert.rejects(importProducts(csv('브랜드,품명,소매 등록\nTEST,상품,아마도'), LIST, 1), /2행.*등록 여부/);
});

test('first sheet is required and later sheets are never selected implicitly', async () => {
  const wb = new ExcelJS.Workbook(); wb.addWorksheet('안내').addRow(['표 없음']);
  const sheet = wb.addWorksheet('상품'); sheet.addRow(['브랜드', '품명']); sheet.addRow(['TEST', '상품']);
  await assert.rejects(importProducts(await xlsx(wb), LIST, 1), /첫 시트/);
});

test('CSV malformed quotes, unsafe links and conflicting duplicate columns fail', async () => {
  await assert.rejects(importProducts(csv('브랜드,품명\nTEST,"닫히지 않음'), LIST, 1), /따옴표/);
  await assert.rejects(importProducts(csv('브랜드,품명,링크\nTEST,상품,javascript:alert(1)'), LIST, 1), /2행.*링크/);
  await assert.rejects(importProducts(csv('브랜드,품명,소매 판매가,판매가\nTEST,상품,1000,2000'), LIST, 1), /2행.*중복 열/);
});

test('1000 rows are imported, 1001 rows fail instead of dropping extras', async () => {
  const rows = Array.from({ length: 1000 }, (_, i) => `TEST,상품${i},${i}`);
  assert.equal((await importProducts(csv('브랜드,품명,소매 판매가\n' + rows.join('\n')), LIST, 1)).length, 1000);
  await assert.rejects(importProducts(csv('브랜드,품명,소매 판매가\n' + [...rows, 'TEST,초과 상품,10'].join('\n')), LIST, 1), /1000행/);
});

test('size, extension, empty data and sequence limits are enforced before mutation', async () => {
  await assert.rejects(importProducts(csv(''), LIST, 1), /빈 파일/);
  await assert.rejects(importProducts(csv('브랜드,품명', 'bad.xls'), LIST, 1), /\.xlsx/);
  await assert.rejects(importProducts(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.xlsx'), LIST, 1), /10MB/);
  await assert.rejects(importProducts(csv('브랜드,품명\n'), LIST, 1), /가져올 상품/);
  await assert.rejects(importProducts(csv('브랜드,품명\nTEST,상품'), LIST, 0), /시작 순번/);
});

test('bundled Excel template preserves the approved blank workbook and imports its retained columns', async () => {
  const bytes = await readFile(new URL('../public/templates/calla-product-list-template.xlsx', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '7da94bbcb2100464d7b403f00378aae676f3a1a78ec3d436e97053628d477814');
  const template = new File([bytes], 'template.xlsx');
  await assert.rejects(inspectProductImport(template, LIST, 3), /머리글 아래에 가져올 상품이 없습니다/);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await template.arrayBuffer());
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['230110']);
  const sheet = workbook.worksheets[0]!;
  assert.equal(sheet.getCell('L3').text, '이미지', 'unused image column stays in the template');
  assert.equal(sheet.getCell('N6').master.address, 'M6', 'original link column remains merged');
  sheet.getRow(6).values = [99, 'TEST', '템플릿 상품', 'MODEL-001', '신규', '브랜드 홈페이지', 'O', 'X', 120000, 0, null, 'ignored image', 'https://example.com/product', null, '메모'];
  const result = await inspectProductImport(await xlsx(workbook), LIST, 3);
  assert.deepEqual(result.headerRows, [3, 4, 5]);
  assert.equal(result.products.length, 1);
  const product = result.products[0]!;
  const fields = ['brand', 'name_own', 'model', 'content', 'image_usage', 'need_retail', 'need_wholesale', 'price_retail', 'price_wholesale', 'price_wholesale_master', 'ref_link', 'note', 'seq'];
  assert.deepEqual(fields.map(field => product[field]), ['TEST', '템플릿 상품', 'MODEL-001', '신규', '브랜드 홈페이지', '필요', '불필요', 120000, 0, null, 'https://example.com/product', '메모', 3]);
  assert.equal(product.need_naver, '불필요');
  assert.equal(product.name_naver, '');
  assert.equal(product.price_retail_regular, null);
  assert.equal(product.image_url, '');
});

test('template download rejects failed, empty and SPA fallback responses before starting a download', async t => {
  const responses = [new Response('not found', { status: 404 }), new Response(''), new Response('<!doctype html><html></html>')];
  t.mock.method(globalThis, 'fetch', async (path: RequestInfo | URL) => {
    assert.equal(path, '/templates/calla-product-list-template.xlsx');
    return responses.shift()!;
  });
  const objectUrl = t.mock.method(URL, 'createObjectURL', () => assert.fail('failed response must not download'));
  for (let index = 0; index < 3; index++) await assert.rejects(downloadTemplate(), /템플릿 파일/);
  assert.equal(objectUrl.mock.callCount(), 0);
});
