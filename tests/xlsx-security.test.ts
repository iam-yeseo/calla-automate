import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { validateXlsxArchive } from '../src/xlsx-limits.ts';
import { inspectProductImport } from '../src/importer.ts';

async function archive(parts: Record<string, string | Uint8Array>) {
  const zip = new JSZip();
  for (const [name, value] of Object.entries(parts)) zip.file(name, value);
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}
const xml = (body: string) => `<worksheet xmlns="urn:unexpected">${body}</worksheet>`;
const rejected = /안전한 처리 범위/;

test('non-ZIP and corrupt archives show the file recovery message', async () => {
  const message = 'XLSX 파일을 읽지 못했습니다. 암호를 해제하고 정상적인 .xlsx 파일로 다시 저장해 주세요.';
  const nonZip = new TextEncoder().encode('not an XLSX archive').buffer;
  const corrupt = (await archive({ 'xl/workbook.xml': '<workbook/>' })).slice(0, 20);
  for (const data of [nonZip, corrupt]) {
    await assert.rejects(validateXlsxArchive(data), { message });
    await assert.rejects(inspectProductImport(new File([data], 'damaged.xlsx'), '11111111-1111-4111-8111-111111111111', 1), { message });
  }
});

test('XML parser exceptions are sanitized while budget errors retain their message', async () => {
  await assert.rejects(validateXlsxArchive(await archive({ 'xl/workbook.xml': '<workbook><unclosed></workbook>' })), {
    message: 'XLSX 파일을 읽지 못했습니다. 암호를 해제하고 정상적인 .xlsx 파일로 다시 저장해 주세요.',
  });
  await assert.rejects(validateXlsxArchive(await archive(Object.fromEntries(Array.from({ length: 513 }, (_, i) => [`${i}.bin`, ''])))), {
    message: 'XLSX 파일의 압축 해제 크기 또는 시트 구조가 안전한 처리 범위를 초과했습니다. 필요한 상품 표만 새 파일에 저장해 주세요.',
  });
});

test('compressed and forged-size archives are bounded before workbook hydration', async () => {
  const data = await archive({ 'unused.bin': new Uint8Array(10 * 1024 * 1024) });
  assert.ok(data.byteLength < 100_000);
  await assert.rejects(validateXlsxArchive(data), rejected);
  const forged = data.slice(0), bytes = new DataView(forged);
  for (let i = 0; i < bytes.byteLength - 46; i++) {
    if (bytes.getUint32(i, true) === 0x02014b50) bytes.setUint32(i + 24, 1, true);
  }
  await assert.rejects(validateXlsxArchive(forged), rejected);
  await assert.rejects(inspectProductImport(new File([data], 'bomb.xlsx'), '11111111-1111-4111-8111-111111111111', 1), rejected);
});

test('aggregate inflation and archive entry count are bounded', async () => {
  const parts: Record<string, Uint8Array> = {};
  for (let i = 0; i < 5; i++) parts[`part${i}.bin`] = new Uint8Array(7 * 1024 * 1024);
  await assert.rejects(validateXlsxArchive(await archive(parts)), rejected);
  await assert.rejects(validateXlsxArchive(await archive(Object.fromEntries(Array.from({ length: 513 }, (_, i) => [`${i}.bin`, ''])))), rejected);
});

test('all allocation-driving structures, hidden sheets and unusual matched paths are checked', async () => {
  const unsafe = [
    '<mergeCells><mergeCell ref="A1:XFD1048576"/></mergeCells>',
    '<mergeCells><mergeCell ref="$A$1:$A$999999999"/></mergeCells>',
    '<mergeCells><mergeCell ref="B2:A1"/></mergeCells>',
    '<cols><col min="1" max="999999999"/></cols>',
    '<cols><col min="999999999" max="1"/></cols>',
    '<sheetData><row r="999999999"><c r="A1"/></row></sheetData>',
    '<sheetData><row r="1"><c r="A999999999"/></row></sheetData>',
    '<sheetData><row r="1oops"><c r="A1"/></row></sheetData>',
    '<sheetData><row r="1"><c r="XFD1"/></row></sheetData>',
    '<sheetData><row r="1">' + '<c/>'.repeat(2049) + '</row></sheetData>',
    '<dataValidations><dataValidation sqref="A1:XFD1048576"/></dataValidations>',
    '<dataValidations><dataValidation sqref="A1 B1:XFD999999"/></dataValidations>',
    '<mergeCells>' + '<mergeCell ref="A1:A2"/>'.repeat(2049) + '</mergeCells>',
  ];
  for (const body of unsafe) {
    await assert.rejects(validateXlsxArchive(await archive({ 'prefix/xl/worksheets/sheet2.xml.suffix': xml(body) })), rejected, body.slice(0, 100));
  }
  for (const body of [
    '<sheets><sheet name="hidden" sheetId="999999999"/></sheets>',
    '<definedNames><definedName name="bomb">Sheet1!$A$1:$XFD$1048576</definedName></definedNames>',
  ]) await assert.rejects(validateXlsxArchive(await archive({ 'xl/workbook.xml': `<workbook>${body}</workbook>` })), rejected);
});

test('XML entities and depth cannot bypass resource limits', async () => {
  await assert.rejects(validateXlsxArchive(await archive({ 'xl/worksheets/sheet1.xml': '<!DOCTYPE worksheet [<!ENTITY x "abc">]><worksheet>&x;</worksheet>' })), rejected);
  await assert.rejects(validateXlsxArchive(await archive({ 'xl/styles.xml': '<x>'.repeat(65) + '</x>'.repeat(65) })), rejected);
  // ExcelJS also parses legacy comment VML, despite its non-.xml extension.
  await assert.rejects(validateXlsxArchive(await archive({ 'xl/drawings/vmlDrawing1.vml': '<xml>' + '<x>'.repeat(65) + '</x>'.repeat(65) + '</xml>' })), rejected);
});

test('harmless dimensions, bounded named ranges and drawing coordinates remain supported', async () => {
  await validateXlsxArchive(await archive({
    'xl/workbook.xml': '<workbook><sheets><sheet sheetId="1"/></sheets><definedNames><definedName name="labels">\'First, sheet\'!$A$1:$B$3</definedName></definedNames></workbook>',
    'xl/worksheets/sheet1.xml': xml('<dimension ref="A1:XFD1048576"/><sheetData><row r="1"><c r="A1"/><c/></row></sheetData><mergeCells><mergeCell ref="A1:B2"/></mergeCells>'),
    'xl/drawings/drawing1.xml': '<xdr:wsDr xmlns:xdr="urn:drawing"><xdr:row>999</xdr:row><xdr:col>5</xdr:col></xdr:wsDr>',
  }));
});
