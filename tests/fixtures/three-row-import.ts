import ExcelJS from 'exceljs';

/** Same merge structure as the supplied request sheet; all values are test data. */
export function threeRowImportWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('등록 요청');
  sheet.getCell('A2').value = '작성일 :';
  sheet.getCell('C2').value = new Date('2026-09-08T00:00:00Z');
  sheet.getRow(3).values = ['No.', '브랜드', '품명', null, '모델명', '내용', '이미지 사용 여부', '등록 여부', null, null, '가격', null, null, null, '이미지', '링크', null, '비고'];
  sheet.getRow(4).values = [null, null, '기본', '스마트스토어 전용', null, null, null, '스마트\n스토어', '자사몰', '도매몰', '자사몰', '도매몰', null, '스마트스토어'];
  sheet.getRow(5).values = [null, null, null, null, null, null, null, null, null, null, null, '베이직', '마스터'];
  for (const range of ['A2:B2', 'A3:A5', 'B3:B5', 'C3:D3', 'C4:C5', 'D4:D5', 'E3:E5', 'F3:F5', 'G3:G5',
    'H3:J3', 'H4:H5', 'I4:I5', 'J4:J5', 'K3:N3', 'K4:K5', 'L4:M4', 'N4:N5', 'O3:O5', 'P3:Q5', 'R3:R5']) sheet.mergeCells(range);
  const retail = [85000, 89000, 85000, null, 92000, 208000];
  const master = [68000, 0, 68000, null, 65000, 146000];
  for (let index = 0; index < 6; index++) {
    const row = index + 6;
    sheet.getRow(row).values = [null, 'TEST', index ? null : '머리글 검증 상품', index ? null : '검색용 상품명', `MODEL-${index + 1}`,
      '신규', '브랜드 본사\n홈페이지', index === 1 ? 'X' : 'O', index === 0 ? 'X' : 'O', index === 1 ? 'X' : 'O',
      retail[index], index === 1 ? 60000 : null, master[index], retail[index] === null ? null : { formula: `K${row}`, result: retail[index]! },
      null, { text: '제품 페이지', hyperlink: `https://example.com/item/${index + 1}` }, null, index === 0 ? '원본 메모' : null];
  }
  // Empty formatted template rows and horizontally merged product links are common in these files.
  for (let row = 6; row <= 26; row++) sheet.mergeCells(`P${row}:Q${row}`);
  sheet.getRow(26).height = 60;
  workbook.addWorksheet('안내').getCell('A1').value = '다른 시트는 가져오지 않습니다.';
  return workbook;
}
