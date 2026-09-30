import { newProduct, parsePrice } from './domain';
import type { Product } from './types';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 1000;
const MAX_COLUMNS = 200;
type Cell = { value: string; link?: string; issue?: string };
type SheetRow = { number: number; cells: Cell[] };
type Mapping = { column: number; field: string; label: string };
const norm = (value: string) => value.replace(/[\s.\-_()[\]/·]/g, '').toLowerCase();
const includes = (value: string, words: string[]) => words.some(word => value.includes(norm(word)));
const empty = (value: string) => value.trim() === '';
const issue = (row: number, label: string, message: string) => new Error(`${row}행${label ? ` · ${label}` : ''}: ${message}`);

function fieldFor(parent: string, child = ''): string[] {
  const p = norm(parent), c = norm(child), all = p + c;
  if (!all) return [];
  if (includes(p, ['브랜드', '제조사', '메이커'])) return ['brand'];
  if (includes(p, ['품명', '상품명', '제품명'])) return [includes(all, ['네이버', '스마트', '스토어']) ? 'name_naver' : 'name_own'];
  if (includes(p, ['모델', '품목코드'])) return ['model'];
  if (includes(all, ['이미지사용', '이미지여부'])) return [];
  if (includes(p, ['등록'])) {
    if (includes(all, ['네이버', '스마트', '스토어'])) return ['need_naver'];
    if (includes(all, ['도매'])) return ['need_wholesale'];
    if (includes(all, ['소매', '자사'])) return ['need_retail'];
    return ['need_retail', 'need_wholesale', 'need_naver'];
  }
  if (includes(all, ['가격', '판매가', '정가', '단가', '소비자가', '공급가', '베이직', '마스터', 'basic', 'master'])) {
    if (includes(all, ['네이버', '스마트스토어'])) return ['price_naver'];
    if (includes(all, ['마스터', 'master'])) return ['price_wholesale_master'];
    if (includes(all, ['베이직', 'basic'])) return ['price_wholesale'];
    if (includes(all, ['도매'])) return [includes(all, ['정가']) ? 'price_retail' : 'price_wholesale'];
    if (includes(all, ['정가', '소비자가']) && !includes(all, ['판매가'])) return ['price_retail_regular'];
    return ['price_retail'];
  }
  if (includes(p, ['링크', 'url', '주소'])) return ['ref_link'];
  if (includes(p, ['비고', '메모', '특이'])) return ['note'];
  return [];
}

function parseCsv(text: string): SheetRow[] {
  if (text.includes('\uFFFD')) throw new Error('CSV 인코딩을 읽을 수 없습니다. UTF-8 CSV로 다시 저장해 주세요.');
  const rows: SheetRow[] = [];
  let fields: Cell[] = [], value = '', quoted = false, afterQuote = false;
  let physicalLine = 1, rowStart = 1;
  function finishCell() {
    fields.push({ value }); value = ''; afterQuote = false;
    if (fields.length > MAX_COLUMNS) throw issue(rowStart, '', `열은 ${MAX_COLUMNS}개 이하여야 합니다.`);
  }
  function finishRow() {
    finishCell();
    if (fields.some(cell => !empty(cell.value))) rows.push({ number: rowStart, cells: fields });
    if (rows.length > MAX_ROWS + 30) throw new Error(`상품은 한 번에 ${MAX_ROWS}행까지 가져올 수 있습니다.`);
    fields = [];
  }
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') { value += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else { value += ch; if (ch === '\n') physicalLine++; }
    } else if (ch === '"') {
      if (value || afterQuote) throw issue(physicalLine, '', 'CSV 따옴표 형식이 올바르지 않습니다.');
      quoted = true;
    } else if (ch === ',') finishCell();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      finishRow(); physicalLine++; rowStart = physicalLine;
    } else {
      if (afterQuote) throw issue(physicalLine, '', '닫는 따옴표 뒤에는 쉼표 또는 줄바꿈만 사용할 수 있습니다.');
      value += ch;
    }
  }
  if (quoted) throw issue(rowStart, '', '닫히지 않은 CSV 따옴표가 있습니다.');
  if (value || fields.length || afterQuote) finishRow();
  return rows;
}

function cellValue(raw: unknown): Cell {
  if (raw == null) return { value: '' };
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return { value: String(raw) };
  if (raw instanceof Date) return { value: raw.toISOString().slice(0, 10) };
  if (typeof raw !== 'object') return { value: '', issue: '지원하지 않는 셀 값입니다.' };
  const value = raw as Record<string, unknown>;
  if ('error' in value) return { value: '', issue: `엑셀 오류 값 ${String(value.error)}을 수정해 주세요.` };
  if ('formula' in value || 'sharedFormula' in value) {
    if (value.result == null) return { value: '', issue: '수식의 저장된 계산 결과가 없습니다. Excel에서 계산 후 저장해 주세요.' };
    return cellValue(value.result);
  }
  if (Array.isArray(value.richText)) return { value: value.richText.map(part => String(part?.text ?? '')).join('') };
  if (typeof value.hyperlink === 'string') return { value: String(value.text ?? value.hyperlink), link: value.hyperlink };
  return { value: '', issue: '지원하지 않는 엑셀 셀 형식입니다.' };
}

async function readXlsx(buffer: ArrayBuffer): Promise<SheetRow[]> {
  const module = await import('exceljs');
  const ExcelJS = module.default ?? module;
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer as Parameters<typeof workbook.xlsx.load>[0]); }
  catch { throw new Error('XLSX 파일을 읽지 못했습니다. 암호를 해제하고 정상적인 .xlsx 파일로 다시 저장해 주세요.'); }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('첫 번째 시트에 상품 표가 없습니다.');
  const rows: SheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, number) => {
    if (row.cellCount > MAX_COLUMNS) throw issue(number, '', `열은 ${MAX_COLUMNS}개 이하여야 합니다.`);
    const cells: Cell[] = [];
    for (let column = 1; column <= row.cellCount; column++) cells.push(cellValue(row.getCell(column).value));
    // ExcelJS resolves merged cells to their master value, including 2-row headers.
    rows.push({ number, cells });
    if (rows.length > MAX_ROWS + 30) throw new Error(`상품은 한 번에 ${MAX_ROWS}행까지 가져올 수 있습니다. 첫 시트의 행을 나눠 주세요.`);
  });
  return rows;
}

function isSubHeader(parent: SheetRow, candidate: SheetRow | undefined): boolean {
  if (!candidate || candidate.number !== parent.number + 1) return false;
  const subWords = ['자사몰', '소매', '도매', '스마트', '네이버', '스토어', '베이직', '마스터', '정가', '판매가', 'basic', 'master'];
  let childLabels = 0;
  for (let i = 0; i < candidate.cells.length; i++) {
    const value = candidate.cells[i]!.value.trim();
    if (!value) continue;
    if (/^\d+(?:[,\.]\d+)*$/.test(value)) return false;
    if (norm(value) === norm(parent.cells[i]?.value ?? '')) continue;
    if (!includes(norm(value), subWords)) return false;
    childLabels++;
  }
  return childLabels > 0;
}

function price(value: string, row: number, label: string): number | null {
  const source = value.trim();
  if (!source || source === '—' || source === '-') return null;
  const clean = source.replace(/^₩\s*/, '').replace(/\s*원$/, '').trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/.test(clean))
    throw issue(row, label, '가격은 천 단위 쉼표를 포함할 수 있는 0 이상의 정수여야 합니다.');
  try { return parsePrice(clean.replace(/\.0+$/, '')); }
  catch { throw issue(row, label, '가격이 유효한 정수 범위를 벗어났습니다.'); }
}

function need(value: string, row: number, label: string): string {
  const n = norm(value);
  if (['필요', 'o', 'ㅇ', '○', '●', 'v', '√', 'y', 'yes', '1', 'true'].includes(n)) return '필요';
  if (['불필요', 'x', '×', 'n', 'no', '0', 'false', '제외'].includes(n)) return '불필요';
  throw issue(row, label, '등록 여부는 필요/불필요 또는 O/X로 입력해 주세요.');
}

function products(rows: SheetRow[], listId: string, startSeq: number): Product[] {
  const headerIndex = rows.findIndex(row => {
    if (row.number > 30) return false;
    const fields = row.cells.flatMap(cell => fieldFor(cell.value));
    return fields.includes('name_own') && new Set(fields).size >= 2;
  });
  if (headerIndex < 0) throw new Error("첫 시트의 30행 안에서 머리글을 찾지 못했습니다. '브랜드 · 품명 · 모델명' 등의 머리글을 확인해 주세요.");
  const header = rows[headerIndex]!;
  const sub = isSubHeader(header, rows[headerIndex + 1]) ? rows[headerIndex + 1] : undefined;
  const mappings: Mapping[] = [];
  for (let c = 0; c < Math.max(header.cells.length, sub?.cells.length ?? 0); c++) {
    const p = header.cells[c]?.value.trim() ?? '', s = sub?.cells[c]?.value.trim() ?? '';
    const label = [p, s && norm(s) !== norm(p) ? s : ''].filter(Boolean).join(' / ');
    fieldFor(p, s).forEach(field => mappings.push({ column: c, field, label }));
  }
  if (!mappings.some(mapping => mapping.field === 'name_own')) throw new Error('자사몰 품명 또는 상품명 열이 필요합니다.');
  const output: Product[] = [];
  for (const row of rows.slice(headerIndex + (sub ? 2 : 1))) {
    if (row.cells.every(cell => empty(cell.value) && !cell.issue && !cell.link)) continue;
    if (output.length >= MAX_ROWS) throw issue(row.number, '', `상품은 한 번에 ${MAX_ROWS}행까지 가져올 수 있습니다.`);
    const product = newProduct(listId, startSeq + output.length);
    const seen = new Map<string, unknown>();
    for (const { column, field, label } of mappings) {
      const cell = row.cells[column];
      if (!cell) continue;
      if (cell.issue) throw issue(row.number, label, cell.issue);
      const raw = (field === 'ref_link' ? cell.link ?? cell.value : cell.value).trim();
      if (!raw) continue;
      let value: string | number | null = raw;
      if (field.startsWith('price_')) value = price(raw, row.number, label);
      else if (field.startsWith('need_')) value = need(raw, row.number, label);
      else if (field === 'ref_link') {
        try { const url = new URL(raw); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); }
        catch { throw issue(row.number, label, '링크는 http:// 또는 https:// 주소로 입력해 주세요.'); }
      }
      if (seen.has(field) && seen.get(field) !== value) throw issue(row.number, label, '같은 항목으로 연결되는 여러 열의 값이 서로 다릅니다. 중복 열을 정리해 주세요.');
      seen.set(field, value); product[field] = value;
    }
    if (!product.name_own.trim()) throw issue(row.number, '품명', '상품명이 비어 있습니다. 빈 상품 행은 가져올 수 없습니다.');
    // The current web product contract keeps Naver price in sync with retail.
    if (!seen.has('price_naver')) product.price_naver = product.price_retail;
    output.push(product);
  }
  if (!output.length) throw new Error('머리글 아래에 가져올 상품이 없습니다.');
  return output;
}

/** Imports every nonblank product row or throws a row-specific validation error. */
export async function importProducts(file: File, listId: string, startSeq: number): Promise<Product[]> {
  if (!/\.(xlsx|csv)$/i.test(file.name)) throw new Error('.xlsx 또는 UTF-8 .csv 파일만 가져올 수 있습니다.');
  if (!file.size) throw new Error('빈 파일은 가져올 수 없습니다.');
  if (file.size > MAX_BYTES) throw new Error('파일 크기는 10MB 이하여야 합니다.');
  if (!Number.isSafeInteger(startSeq) || startSeq < 1) throw new Error('상품 시작 순번은 1 이상의 정수여야 합니다.');
  const buffer = await file.arrayBuffer();
  const rows = /\.csv$/i.test(file.name) ? parseCsv(new TextDecoder('utf-8').decode(buffer)) : await readXlsx(buffer);
  return products(rows, listId, startSeq);
}

export function templateCsv(): string {
  return '\uFEFF브랜드,품명,모델명,소매 정가,소매 판매가,도매 베이직,도매 마스터,링크,비고\r\n' +
    'AVMATRIX,예시 상품,MODEL-001,120000,100000,90000,85000,https://example.com/product,예시 행을 삭제한 뒤 상품을 입력하세요\r\n';
}

export function downloadTemplate(): void {
  const url = URL.createObjectURL(new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = 'CALLA_상품등록_양식.csv';
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
