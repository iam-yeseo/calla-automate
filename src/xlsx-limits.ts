import JSZip from 'jszip';
import { SaxesParser } from 'saxes';

// These are parser safety limits, separate from the first sheet's 1,000-product limit.
const ENTRY_BYTES = 8 * 1024 * 1024;
const TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_COORDINATE_ROW = 10_000;
const MAX_COORDINATE_COLUMN = 2_048;
const MAX_CELLS = 250_000;
class XlsxValidationError extends Error {}
const invalid = () => new XlsxValidationError('XLSX 파일의 압축 해제 크기 또는 시트 구조가 안전한 처리 범위를 초과했습니다. 필요한 상품 표만 새 파일에 저장해 주세요.');
const unreadable = () => new XlsxValidationError('XLSX 파일을 읽지 못했습니다. 암호를 해제하고 정상적인 .xlsx 파일로 다시 저장해 주세요.');
type Budget = { bytes: number; nodes: number; rows: number; cells: number; merges: number; sheets: number };
// JSZip exposes this documented API at runtime but omits it from JSZipObject's typings.
type StreamedEntry = JSZip.JSZipObject & { internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array> };

function positive(value: string | undefined, max: number): number {
  if (!value || !/^[1-9][0-9]*$/.test(value)) throw invalid();
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n > max) throw invalid();
  return n;
}

function address(value: string): { row: number; col: number } {
  const match = /^\$?([A-Z]{1,3})\$?([1-9][0-9]*)$/.exec(value);
  if (!match) throw invalid();
  let col = 0;
  for (const letter of match[1]!) col = col * 26 + letter.charCodeAt(0) - 64;
  if (col > MAX_COORDINATE_COLUMN) throw invalid();
  return { row: positive(match[2], MAX_COORDINATE_ROW), col };
}

function cells(budget: Budget, count: number) {
  budget.cells += count;
  if (budget.cells > MAX_CELLS) throw invalid();
}

function range(value: string, budget: Budget) {
  const parts = value.split(':');
  if (parts.length > 2) throw invalid();
  const from = address(parts[0]!), to = address(parts[1] ?? parts[0]!);
  if (to.row < from.row || to.col < from.col) throw invalid();
  cells(budget, (to.row - from.row + 1) * (to.col - from.col + 1));
}

function definedRanges(source: string, budget: Budget) {
  // Excel quoted sheet names can contain commas and escaped single quotes.
  let quoted = false, part = '';
  const consume = () => {
    const candidate = part.slice(part.lastIndexOf('!') + 1).trim();
    // ExcelJS hydrates names containing absolute cell references. Reject complex
    // expressions containing those references instead of guessing their extent.
    if (/\$\w+\$\d+/.test(candidate)) range(candidate, budget);
    part = '';
  };
  for (const ch of source) {
    if (ch === "'") quoted = !quoted;
    if (ch === ',' && !quoted) consume(); else part += ch;
  }
  if (quoted) throw invalid();
  consume();
}

function inspectXml(source: string, budget: Budget) {
  const parser = new SaxesParser({ xmlns: false });
  let depth = 0, column = 0, defined: string | null = null;
  parser.on('doctype', () => { throw invalid(); });
  parser.on('opentag', tag => {
    if (++depth > 64 || ++budget.nodes > 500_000) throw invalid();
    // ExcelJS matches unqualified names even under an unexpected default namespace.
    const name = tag.name;
    const attrs = tag.attributes as Record<string, string>;
    if (name === 'sheet') {
      positive(attrs.sheetId, 1024);
      if (++budget.sheets > 32) throw invalid();
    } else if (name === 'row') {
      positive(attrs.r, MAX_COORDINATE_ROW); column = 0;
      if (++budget.rows > 10_000) throw invalid();
    } else if (name === 'c') {
      column = attrs.r ? address(attrs.r).col : column + 1;
      if (column > MAX_COORDINATE_COLUMN) throw invalid();
      cells(budget, 1);
    } else if (name === 'col') {
      const min = positive(attrs.min, MAX_COORDINATE_COLUMN), max = positive(attrs.max, MAX_COORDINATE_COLUMN);
      if (max < min) throw invalid();
    } else if (name === 'mergeCell') {
      if (++budget.merges > 2048 || !attrs.ref) throw invalid();
      range(attrs.ref, budget);
    } else if (name === 'dataValidation') {
      if (!attrs.sqref) throw invalid();
      for (const ref of attrs.sqref.trim().split(/\s+/)) range(ref, budget);
    } else if (name === 'definedName') defined = '';
    else if ((name === 'hyperlink' || name === 'comment') && attrs.ref) range(attrs.ref, budget);
    // A dimension alone is metadata; it does not cause ExcelJS to allocate cells.
  });
  parser.on('text', text => { if (defined !== null) defined += text; });
  parser.on('cdata', text => { if (defined !== null) defined += text; });
  parser.on('closetag', tag => {
    if (tag.name === 'definedName' && defined !== null) { definedRanges(defined, budget); defined = null; }
    depth--;
  });
  for (let offset = 0; offset < source.length; offset += 16_384) parser.write(source.slice(offset, offset + 16_384));
  parser.close();
}

async function inspectEntry(entry: JSZip.JSZipObject, budget: Budget) {
  // Count actual emitted bytes, not the ZIP's attacker-controlled size fields.
  // XML is decoded only after its byte budget passes. Inspect every XML part,
  // including unusual worksheet paths matched by ExcelJS's unanchored regex.
  const xml = /\.xml|\.rels|\.vml/i.test(entry.name);
  const chunks: Uint8Array[] = [];
  let size = 0;
  await new Promise<void>((resolve, reject) => {
    const stream = (entry as StreamedEntry).internalStream('uint8array');
    let failed = false;
    stream.on('data', (chunk: Uint8Array) => {
      if (failed) return;
      size += chunk.byteLength; budget.bytes += chunk.byteLength;
      if (size > ENTRY_BYTES || budget.bytes > TOTAL_BYTES) {
        failed = true; stream.pause(); chunks.length = 0; reject(invalid()); return;
      }
      if (xml) chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.resume();
  });
  if (xml) {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    inspectXml(new TextDecoder('utf-8', { fatal: true }).decode(bytes), budget);
  }
}

export async function validateXlsxArchive(buffer: ArrayBuffer): Promise<void> {
  try {
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(buffer); }
    catch { throw unreadable(); }
    const entries = Object.values(zip.files);
    if (entries.length > 512) throw invalid();
    const budget: Budget = { bytes: 0, nodes: 0, rows: 0, cells: 0, merges: 0, sheets: 0 };
    for (const entry of entries) if (!entry.dir) await inspectEntry(entry, budget);
  } catch (error) {
    if (error instanceof XlsxValidationError) throw error;
    throw unreadable();
  }
}
