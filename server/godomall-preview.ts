import type { GodomallOperation, MallCode, ProductRegistrationPreview } from '../src/godomall-types';
import { resolveShippingPolicy } from '../src/registration-delivery';
import type { Channel } from '../src/types';

interface PreviewSource {
  title: string;
  expected?: Record<string, string>;
  changes: GodomallOperation['changes'];
  mall_id?: Channel;
}

const amount = (value: string): number | null => {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
};

/** Store display-only lookup results beside the field they describe. The XML
 * payload and expected values remain exactly what was prepared for Godomall. */
export function describeInsertCodes(changes: GodomallOperation['changes'], codes: Record<string, MallCode>, mall?: Channel): GodomallOperation['changes'] {
  const price = amount(changes.find(change => change.field === 'goodsPrice')?.after || '');
  return changes.map(change => {
    if (change.field === 'allCateCd' && change.after) {
      const categories = change.after.split('|').map(code => ({ code, name: codes[`category:${code}`]?.name || null, path: codes[`category:${code}`]?.name ? [codes[`category:${code}`].name] : [] }));
      return { ...change, display: { name: categories.map(category => category.name || category.code).join(' · '), categories } };
    }
    const code = codes[change.field];
    if (!code || code.code !== change.after) return change;
    const shipping = change.field === 'deliverySno' && mall ? resolveShippingPolicy(mall, code.code, code.name, price) : null;
    return { ...change, display: { name: code.name, ...(change.field === 'cateCd' ? { path: [code.name] } : {}), ...(shipping ? { shipping: { ...shipping, policySource: 'prepared-snapshot' as const } } : {}) } };
  });
}

/** Read the saved operation snapshot, never the mutable product editor record.
 * changes.after also supports operations prepared before previews existed. */
export function registrationPreview(source: PreviewSource): ProductRegistrationPreview {
  const fields = { ...Object.fromEntries(source.changes.filter(row => row.after !== null).map(row => [row.field, row.after!])), ...source.expected };
  const field = (name: string) => fields[name] ?? '';
  const display = (name: string) => source.changes.find(row => row.field === name && row.after === field(name))?.display;
  const category = display('cateCd');
  const delivery = display('deliverySno');
  const shipping = delivery?.shipping;
  const verifiedShipping = shipping?.mallId === source.mall_id && shipping?.code === field('deliverySno') && shipping?.name === delivery?.name ? shipping : null;
  return {
    name: field('goodsNm') || source.title,
    thumbnailUrl: field('listImageData') || field('mainImageData') || field('detailImageData') || null,
    brand: { code: field('brandCd'), name: display('brandCd')?.name || null },
    category: { code: field('cateCd'), name: category?.name || null, path: category?.path || (category?.name ? [category.name] : []) },
    categories: (field('allCateCd') || field('cateCd')).split('|').filter(Boolean).map(code => display('allCateCd')?.categories?.find(category => category.code === code) || { code, name: code === field('cateCd') ? category?.name || null : null, path: code === field('cateCd') ? category?.path || [] : [] }),
    price: amount(field('goodsPrice')),
    regularPrice: amount(field('fixedPrice')),
    manufacturer: field('makerNm'),
    origin: field('originNm'),
    model: field('goodsModelNo'),
    // Code_Search alone supplies no fee. Use only a matching policy observation
    // captured with this operation, keeping older unknown values explicit.
    shipping: verifiedShipping || { code: field('deliverySno'), name: delivery?.name || null, fee: null, freeAbove: null, description: '고도몰 배송조건 적용 · 배송비 금액은 주문 조건에 따라 결정됩니다.' },
    detailHtml: field('goodsDescription'),
    detailHtmlMobile: field('goodsDescriptionMobile'),
    display: { pc: field('goodsDisplayFl'), mobile: field('goodsDisplayMobileFl') },
    sell: { pc: field('goodsSellFl'), mobile: field('goodsSellMobileFl') },
  };
}
