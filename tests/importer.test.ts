import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { importProducts, templateCsv } from '../src/importer.ts';

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

test('blank rows are skipped, but partially filled rows without a product name fail with row number', async () => {
  const items = await importProducts(csv('브랜드,품명,모델명\n,,\nTEST,상품,M-1\n'), LIST, 1);
  assert.equal(items.length, 1);
  await assert.rejects(importProducts(csv('브랜드,품명,모델명\nTEST,상품,M-1\nTEST,,M-2'), LIST, 1), /3행.*품명/);
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

test('download template round-trips to the supported CSV columns', async () => {
  const [product] = await importProducts(csv(templateCsv()), LIST, 3);
  assert.equal(product!.price_retail_regular, 120000);
  assert.equal(product!.price_retail, 100000);
  assert.equal(product!.price_wholesale, 90000);
  assert.equal(product!.price_wholesale_master, 85000);
  assert.equal(product!.seq, 3);
});
