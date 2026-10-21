import type { Channel } from './types';

export const MALLS = {
  retail: { id: 'retail', name: '소매몰', domain: 'www.callamedia.kr', secretName: 'GODOMALL_CALLAMEDIA_API_USER_KEY' },
  wholesale: { id: 'wholesale', name: '도매몰', domain: 'www.callamedia.co.kr', secretName: 'GODOMALL_CALLAMEDIA1_API_USER_KEY' },
} as const;
export const productUrl = (mall: Channel, goodsNo: string) => `https://${MALLS[mall].domain}/goods/goods_view.php?goodsNo=${encodeURIComponent(goodsNo)}`;
export type OperationKind = 'insert' | 'update' | 'delete';
export type OperationState = 'prepared' | 'sending' | 'verifying' | 'success' | 'failed' | 'needs_review';
export const OPERATION_LABELS: Record<OperationState, string> = { prepared: '실행 전 검토', sending: '요청 처리 중', verifying: '결과 확인 중', success: '반영 확인 완료', failed: '실패', needs_review: '결과 확인 필요' };
export const ACTION_LABELS: Record<OperationKind, string> = { insert: '등록', update: '수정', delete: '삭제상품관리로 이동' };
export interface RemoteGoods {
  mallId: Channel;
  goodsNo: string;
  name: string | null;
  model: string | null;
  price: number | null;
  stock: number | null;
  stockMode: string | null;
  soldOut: string | null;
  display: string | null;
  displayMobile: string | null;
  sell: string | null;
  sellMobile: string | null;
  image: string | null;
  url: string;
  checkedAt: string;
  fields: Record<string, string>;
  preservationIssues: string[];
  fingerprint: string;
}
export interface GoodsPage { goods: RemoteGoods[]; total: number | null; page: number; maxPage: number | null; hasNext: boolean; checkedAt: string }
export interface MallConnection { mallId: Channel; configured: boolean; connected: boolean | null; checkedAt: string | null; message: string; code?: string }
export interface MallCode { code: string; name: string; fields: Record<string, string> }
export interface ProductPreviewShippingMethod {
  code: string; name: string; baseFee: number; freeAbove: number | null;
  fee: number | null; description: string;
}
export interface ProductPreviewShipping {
  code: string; name: string | null; fee: number | null; freeAbove: number | null; description: string;
  baseFee?: number;
  methods?: ProductPreviewShippingMethod[];
  checkedAt?: string;
  sourceUrl?: string;
  priceBasis?: string;
  additionalFeeNote?: string;
  policySource?: 'prepared-snapshot' | 'current-policy';
  mallId?: Channel;
  defaultMethod?: string;
  verification?: string;
  additionalInfo?: string[];
  payment?: string;
  chargeGrouping?: string;
}
export interface ProductRegistrationPreview {
  name: string;
  thumbnailUrl: string | null;
  brand: { code: string; name: string | null };
  category: { code: string; name: string | null; path: string[] };
  categories?: { code: string; name: string | null; path: string[] }[];
  price: number | null;
  regularPrice: number | null;
  manufacturer: string;
  origin: string;
  model: string;
  shipping: ProductPreviewShipping;
  detailHtml: string;
  detailHtmlMobile: string;
  display: { pc: string; mobile: string };
  sell: { pc: string; mobile: string };
}
export interface OperationChange {
  field: string; label: string; before: string | null; after: string | null;
  // Names captured from this mall while preparing the immutable operation.
  // This JSON metadata is never included in the Godomall request or verification.
  display?: { name: string; path?: string[]; categories?: { code: string; name: string | null; path: string[] }[]; shipping?: ProductPreviewShipping };
}
export interface GodomallOperation {
  id: string; mall_id: Channel; kind: OperationKind; state: OperationState; item_id: string | null;
  goods_no: string | null; title: string; marker: string | null;
  changes: OperationChange[];
  product_preview?: ProductRegistrationPreview;
  warnings: string[]; error_message: string | null; response_code: string | null;
  created_at: string; updated_at: string; checked_at: string | null; expires_at: string;
  verification_attempts: number;
}
export const EDIT_FIELDS: Record<string, string> = {
  goodsNm: '상품명', goodsModelNo: '모델번호', makerNm: '제조사', originNm: '원산지',
  goodsPrice: '판매가', fixedPrice: '정가', totalStock: '상품 재고', stockFl: '판매 재고', soldOutFl: '품절 상태',
  goodsDisplayFl: 'PC 노출', goodsDisplayMobileFl: '모바일 노출', goodsSellFl: 'PC 판매', goodsSellMobileFl: '모바일 판매',
  cateCd: '대표 카테고리', brandCd: '브랜드 코드', deliverySno: '배송비 코드',
  goodsDescription: 'PC 상세설명', goodsDescriptionMobile: '모바일 상세설명',
};
