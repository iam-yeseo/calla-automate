import core from '../src/lib/automation-core.js';
import type { Channel, Product } from '../src/types';
import { EDIT_FIELDS, type GodomallOperation, type MallCode } from '../src/godomall-types';
import { GodomallClient, preservationIssues, REQUIRED_FIELDS } from './godomall-client';
import { canonicalXml, child, children, documentXml, GodomallError, scalarFields, setValue, value, xmlNode, type XmlNode } from './godomall-xml';
import { requiredInfoValue, withRequiredInfo } from './godomall-preservation';
import type { InsertDefaults } from './godomall-defaults';
import { sameDescription } from './godomall-description';

export interface InsertChoices extends InsertDefaults { brandCd: string; scmNo?: string; acknowledgeWholesalePrice?: boolean }
const flagKeys = new Set('stockFl soldOutFl goodsDisplayFl goodsDisplayMobileFl goodsSellFl goodsSellMobileFl'.split(' '));
const priceKeys = new Set(['goodsPrice', 'fixedPrice', 'totalStock']);
const productImageFields = ['magnifyImageData', 'detailImageData', 'listImageData', 'mainImageData'] as const;
export function validateChanges(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new GodomallError(422, '변경할 항목을 확인해 주세요.', 'invalid_changes');
  const changes: Record<string, string> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!(key in EDIT_FIELDS) || typeof raw !== 'string') throw new GodomallError(422, '지원하지 않는 수정 항목입니다.', 'invalid_changes');
    const limit = key.startsWith('goodsDescription') ? 300000 : ['goodsNm'].includes(key) ? 250 : ['goodsModelNo', 'makerNm', 'originNm'].includes(key) ? 30 : 100;
    if (raw.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(raw)) throw new GodomallError(422, `${EDIT_FIELDS[key]}의 길이 또는 문자를 확인해 주세요.`, 'invalid_changes');
    if (flagKeys.has(key) && !['y', 'n'].includes(raw)) throw new GodomallError(422, `${EDIT_FIELDS[key]} 값을 확인해 주세요.`, 'invalid_changes');
    if (priceKeys.has(key) && (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > 1e12)) throw new GodomallError(422, `${EDIT_FIELDS[key]}는 0 이상의 정수여야 합니다.`, 'invalid_changes');
    if (key === 'goodsNm' && !raw.trim()) throw new GodomallError(422, '상품명을 입력해 주세요.', 'invalid_changes');
    changes[key] = raw;
  }
  return changes;
}
export async function validateMallCodes(client: GodomallClient, fields: Record<string, string>, before?: Record<string, string>) {
  const matched: Record<string, MallCode> = {};
  // Validate only changed codes on updates; untouched codes come from this mall's latest product.
  for (const [field, kind] of [['cateCd', 'categories'], ['brandCd', 'brands'], ['deliverySno', 'delivery'], ['scmNo', 'scm']] as const) {
    if (before && fields[field] === before[field]) continue;
    if (field === 'brandCd' && !fields[field]) continue;
    matched[field] = await client.validateCode(kind, fields[field] || '');
  }
  // Every newly connected category belongs to this mall. Unchanged update
  // categories stay under the existing preservation contract.
  if (!before || fields.allCateCd !== before.allCateCd) {
    const previous = new Set((before?.allCateCd || '').split('|'));
    for (const code of (fields.allCateCd || '').split('|').filter(Boolean)) {
      if (before && previous.has(code)) continue;
      matched[`category:${code}`] = code === fields.cateCd && matched.cateCd
        ? matched.cateCd : await client.validateCode('categories', code);
    }
  }
  return matched;
}
export function prepareInsert(product: Product, mall: Channel, marker: string, choices: InsertChoices) {
  const auto = core.normalize(product.automation), details = core.detailHtml(auto);
  const price = mall === 'retail' ? product.price_retail : product.price_wholesale;
  const fixed = mall === 'retail' ? product.price_retail_regular : core.wholesaleRegularPrice(product);
  if (price === null || !Number.isSafeInteger(price) || price < 0) throw new GodomallError(422, '선택한 몰의 판매가를 입력하고 저장해 주세요.', 'price_required');
  const warnings: string[] = [];
  if (mall === 'wholesale' && product.price_wholesale_master !== null && product.price_wholesale_master !== price) {
    warnings.push(`도매 마스터 가격 ${product.price_wholesale_master.toLocaleString('ko-KR')}원은 API로 전송하지 않았습니다. 고도몰 관리자에서 별도로 설정해 주세요.`);
  }
  if (product.model && !/^[A-Za-z0-9_]{1,30}$/.test(product.model)) warnings.push('모델번호를 입력한 그대로 전송합니다. 고도몰 API의 허용 문자 규칙에 따라 거절될 수 있습니다.');
  const fields: Record<string, string> = {
    goodsNmFl: 'd', goodsNm: product.name_own,
    goodsDisplayFl: 'n', goodsDisplayMobileFl: 'n', goodsSellFl: 'y', goodsSellMobileFl: 'y',
    scmNo: '1', goodsCd: marker, cateCd: auto.categoryCodes[mall], allCateCd: (auto.categorySelections?.[mall] || [auto.categoryCodes[mall]]).join('|'), goodsState: 'n',
    brandCd: choices.brandCd, makerNm: auto.manufacturer?.trim() || product.brand, originNm: auto.origin, goodsModelNo: product.model,
    goodsPermission: 'all', onlyAdultFl: 'n', taxFreeFl: 't', taxPercent: '10', totalStock: String(auto.stock?.quantity ?? 0), stockFl: auto.stock?.mode === 'limited' ? 'y' : 'n', soldOutFl: 'n',
    imageStorage: 'local', restockFl: 'n', mileageFl: 'c', goodsDiscountFl: 'n', payLimitFl: 'n',
    goodsPrice: String(price), ...(fixed !== null ? { fixedPrice: String(fixed) } : {}),
    optionFl: 'n', optionTextFl: 'n', addGoodsFl: 'n', goodsDescription: details, goodsDescriptionMobile: details,
    deliverySno: choices.deliverySno, relationFl: 'n', imgDetailViewFl: 'n', externalVideoFl: 'n',
    detailInfoDelivery: choices.detailInfoDelivery, detailInfoAS: choices.detailInfoAS, detailInfoRefund: choices.detailInfoRefund, detailInfoExchange: '0', ex_title: '',
  };
  validateChanges(Object.fromEntries(Object.entries(fields).filter(([key]) => key in EDIT_FIELDS)));
  if (Object.values(fields).some(v => typeof v !== 'string') || REQUIRED_FIELDS.some(key => !fields[key])) throw new GodomallError(422, '상품명·카테고리·공급사·배송비 필수 설정을 확인해 주세요.', 'fields_required');
  const node = xmlNode('goods_data', '', Object.entries(fields).map(([k, v]) => xmlNode(k, v)));
  if (product.image_url) {
    let image: URL; try { image = new URL(product.image_url); } catch { throw new GodomallError(422, '대표 이미지 주소를 확인해 주세요.', 'invalid_image'); }
    if (!['https:', 'http:'].includes(image.protocol) || image.username || image.password) throw new GodomallError(422, '대표 이미지 주소를 확인해 주세요.', 'invalid_image');
    // The URL is the import source. Godomall copies it into its default storage
    // so administrators can replace the image through the normal file inputs.
    for (const key of productImageFields) {
      const imageNode = xmlNode(key, product.image_url);
      imageNode.attributes.image_size_decrease = 'Y';
      node.children.push(imageNode);
    }
  } else warnings.push('대표 이미지가 비어 있습니다. 상세설명 이미지는 그대로 전송합니다.');
  node.children.push(xmlNode('goodsMustInfoData'));
  const insertLabels: Record<string, string> = { goodsCd: '등록 확인용 고유 코드', scmNo: '공급사', allCateCd: '전체 연결 카테고리', goodsPermission: '구매 가능 대상', taxFreeFl: '과세 구분', detailInfoDelivery: '배송안내', detailInfoAS: 'AS안내', detailInfoRefund: '환불안내' };
  const changes: GodomallOperation['changes'] = Object.entries(fields).filter(([key]) => key in EDIT_FIELDS || key in insertLabels).map(([field, after]) => ({ field, label: EDIT_FIELDS[field] || insertLabels[field], before: null, after }));
  if (product.image_url) changes.push({ field: 'listImageData', label: '대표 이미지', before: null, after: product.image_url });
  const expectedImages = product.image_url ? Object.fromEntries(productImageFields.map(key => [key, product.image_url!])) : {};
  return { node, xml: documentXml(node), expected: { ...fields, ...expectedImages }, changes, warnings };
}
const writeScalars = new Set(('goodsNo goodsNmFl goodsNm goodsNmMain goodsNmList goodsNmDetail goodsNmPartner purchaseGoodsNm goodsDisplayFl goodsDisplayMobileFl goodsSellFl goodsSellMobileFl scmNo goodsCd cateCd goodsSearchWord goodsOpenDt goodsState goodsColor brandCd makerNm originNm goodsModelNo makeYmd launchYmd effectiveStartYmd effectiveEndYmd goodsPermission goodsPermissionGroup onlyAdultFl taxFreeFl taxPercent goodsWeight totalStock stockFl soldOutFl salesUnit minOrderCnt maxOrderCnt salesStartYmd salesEndYmd imageStorage restockFl mileageFl mileageGoods mileageGoodsUnit goodsDiscountFl goodsDiscount goodsDiscountUnit payLimitFl payLimit goodsPriceString goodsPrice fixedPrice costPrice optionFl optionDisplayFl optionName optionTextFl addGoodsFl shortDescription goodsDescription goodsDescriptionMobile deliverySno relationFl relationSameFl relationGoodsNo goodsIconStartYmd goodsIconEndYmd goodsIconCdPeriod goodsIconCd imgDetailViewFl externalVideoFl externalVideoUrl externalVideoWidth externalVideoHeight detailInfoDelivery detailInfoAS detailInfoRefund detailInfoExchange memo allCateCd ex_title naverFl naverImportFlag naverProductFlag naverAgeGroup naverGender naverTag naverAttribute naverCategory naverProductId naverNpayAble cultureBenefitFl eventDescription seoTagFl seoTagTitle seoTagAuthor seoTagDescription seoTagKeyword daumFl fixedOrderCnt naverBookFlag naverBookIsbn naverBrandCertFl kcmarkInfo').split(' '));
const nestedWrite: Record<string, Set<string> | null> = {
  optionData: new Set('sno optionNo optionValue1 optionValue2 optionValue3 optionValue4 optionValue5 optionPrice optionViewFl optionSellFl optionCode stockCnt'.split(' ')),
  textOptionData: new Set('sno optionName mustFl addPrice inputLimit'.split(' ')), addGoodsData: null, goodsMustInfoData: null,
};
const preservedTags = ['optionData', 'textOptionData', 'addGoodsData', 'goodsMustInfoData', 'magnifyImageData', 'detailImageData', 'listImageData', 'mainImageData'];
function preservedValue(node: XmlNode, tag: string): string {
  if (tag === 'goodsMustInfoData') return requiredInfoValue(node);
  const nodes = children(node, tag).map(original => {
    const n = structuredClone(original);
    if (nestedWrite[tag]) n.children = n.children.filter(c => nestedWrite[tag]!.has(c.name));
    // Read-only timestamps are allowed to change, but option IDs and values are not.
    return canonicalXml(n);
  });
  return JSON.stringify(nodes);
}
export function prepareUpdate(original: XmlNode, input: unknown) {
  const issues = preservationIssues(original);
  const patch = validateChanges(input), before = scalarFields(original), node = withRequiredInfo(original);
  if ('goodsNm' in patch && patch.goodsNm !== before.goodsNm) {
    // Basic names keep the exact entered text, including literal markup.
    // Existing extended names are retained with the other untouched remote fields.
    patch.goodsNmFl = 'd';
  }
  if ('totalStock' in patch && before.optionFl === 'y') issues.push('옵션 상품의 전체 재고를 전송합니다. 기존 옵션별 재고는 함께 유지되므로 고도몰이 계산한 실제 재고를 결과에서 확인합니다.');
  if (patch.goodsModelNo && !/^[A-Za-z0-9_]{1,30}$/.test(patch.goodsModelNo)) issues.push('모델번호를 입력한 그대로 전송합니다. 고도몰 API의 허용 문자 규칙에 따라 거절될 수 있습니다.');
  node.children = node.children.filter(n => writeScalars.has(n.name) || /^ex\d+$/.test(n.name) || n.name in nestedWrite);
  node.text = '';
  for (const n of node.children) if (nestedWrite[n.name]) n.children = n.children.filter(c => nestedWrite[n.name]!.has(c.name));
  const changes: GodomallOperation['changes'] = [];
  const nameLabels: Record<string, string> = { goodsNmFl: '상품명 표시 방식', goodsNmMain: '메인 상품명', goodsNmList: '목록 상품명', goodsNmDetail: '상세 상품명' };
  for (const [field, after] of Object.entries(patch)) if (before[field] !== after) { setValue(node, field, after); changes.push({ field, label: EDIT_FIELDS[field] || nameLabels[field] || field, before: before[field] ?? null, after }); }
  if (!changes.length) throw new GodomallError(422, '변경된 항목이 없습니다.', 'no_changes');
  if (patch.cateCd && patch.cateCd !== before.cateCd) {
    const connected = [...new Set([...(before.allCateCd || '').split('|').filter(Boolean), patch.cateCd])].join('|');
    setValue(node, 'allCateCd', connected); changes.push({ field: 'allCateCd', label: '연결 카테고리 (기존 분류 유지)', before: before.allCateCd, after: connected });
  }
  setValue(node, 'imageUpdate', 'N');
  const fields = scalarFields(node);
  if (REQUIRED_FIELDS.some(k => !fields[k])) throw new GodomallError(422, '필수값을 비울 수 없습니다.', 'fields_required');
  const expected = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== 'imageUpdate'));
  for (const tag of preservedTags) if (tag !== 'goodsMustInfoData' || child(node, tag)) expected[`__preserve_${tag}`] = preservedValue(original, tag);
  return { node, xml: documentXml(node), expected, before, fields, changes, warnings: [...issues, '이미지는 유지합니다 (imageUpdate=N). 조회된 옵션·추가상품·필수정보·추가정보를 수정 요청에 함께 전송합니다.'] };
}
function sameConnectedCategories(wanted: string, got: string): boolean {
  if (wanted === got) return true;
  const expected = wanted.split('|'), actual = got.split('|');
  if (![...expected, ...actual].every(code => /^(?:\d{3}){1,4}$/.test(code))) return false;
  // Godomall returns ancestor categories as well as the submitted leaf:
  // a live insert of 017007 is read back as 017|017007. Keep every requested
  // category and accept only its ancestors, never another leaf or subtree.
  return expected.every(code => actual.includes(code))
    && actual.every(code => expected.some(target => target.startsWith(code)));
}
export function mismatches(expected: Record<string, string>, actual: XmlNode): string[] {
  const numeric = new Set(['goodsPrice', 'fixedPrice', 'costPrice', 'totalStock', 'taxPercent', 'scmNo', 'deliverySno']);
  return Object.entries(expected).filter(([key, wanted]) => {
    if (key.startsWith('__preserve_')) return preservedValue(actual, key.slice('__preserve_'.length)) !== wanted;
    if (key === 'imageUpdate') return false;
    if (expected.imageStorage === 'local' && productImageFields.some(field => field === key)) {
      // Imported/resized images get new URLs. Require an actual saved image in
      // every submitted slot; an echoed source URL is not evidence of a copy.
      // Legacy URL operations and ordinary updates still use exact comparisons.
      const images = children(actual, key);
      if (images.length !== 1 || images[0].children.length || value(actual, 'imageStorage') !== 'local') return true;
      try {
        const stored = new URL(images[0].text.trim()), source = new URL(wanted);
        stored.hash = ''; source.hash = '';
        return !['https:', 'http:'].includes(stored.protocol) || Boolean(stored.username || stored.password)
          || stored.pathname === '/' || stored.href === source.href;
      } catch { return true; }
    }
    const got = value(actual, key);
    if (got === null) return wanted !== ''; // Optional blank fields may be omitted by Godomall.
    if (key === 'allCateCd') return !sameConnectedCategories(wanted, got);
    if (numeric.has(key) && wanted !== '' && got !== '') return Number(got) !== Number(wanted);
    if (key === 'goodsDescription' || key === 'goodsDescriptionMobile') return !sameDescription(wanted, got);
    return got.replace(/\r\n/g, '\n') !== wanted.replace(/\r\n/g, '\n');
  }).map(([key]) => EDIT_FIELDS[key] || key);
}
