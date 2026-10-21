import type { GodomallOperation, ProductRegistrationPreview } from './godomall-types';

// Backward-compatible display for an older server or a history-list summary.
// Never substitute the current draft for the immutable operation values.
export function operationPreview(operation: GodomallOperation): ProductRegistrationPreview {
  const fields = Object.fromEntries(operation.changes.map(change => [change.field, change.after]));
  const field = (key: string) => fields[key] ?? '';
  const number = (key: string) => /^\d+$/.test(field(key)) && Number.isSafeInteger(Number(field(key))) ? Number(field(key)) : null;
  const display = (key: string) => operation.changes.find(change => change.field === key)?.display;
  return {
    name: field('goodsNm') || operation.title,
    thumbnailUrl: field('listImageData') || null,
    brand: { code: field('brandCd'), name: display('brandCd')?.name || null },
    category: { code: field('cateCd'), name: display('cateCd')?.name || null, path: display('cateCd')?.path || [] },
    categories: (field('allCateCd') || field('cateCd')).split('|').filter(Boolean).map(code => display('allCateCd')?.categories?.find(category => category.code === code) || { code, name: code === field('cateCd') ? display('cateCd')?.name || null : null, path: code === field('cateCd') ? display('cateCd')?.path || [] : [] }),
    price: number('goodsPrice'), regularPrice: number('fixedPrice'),
    manufacturer: field('makerNm'), origin: field('originNm'), model: field('goodsModelNo'),
    shipping: { code: field('deliverySno'), name: display('deliverySno')?.name || null, fee: null, freeAbove: null, description: '고도몰 배송조건 적용 · 배송비 금액은 주문 조건에 따라 결정됩니다.' },
    detailHtml: field('goodsDescription'), detailHtmlMobile: field('goodsDescriptionMobile'),
    display: { pc: field('goodsDisplayFl'), mobile: field('goodsDisplayMobileFl') },
    sell: { pc: field('goodsSellFl'), mobile: field('goodsSellMobileFl') },
  };
}
