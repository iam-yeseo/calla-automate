import policies from './data/godomall-delivery-policies.json' with { type: 'json' };
import type { ProductPreviewShipping, ProductPreviewShippingMethod } from './godomall-types';
import type { Channel } from './types';

const validAmount = (value: number) => Number.isSafeInteger(value) && value >= 0;
const formatAmount = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const feeAt = (baseFee: number, freeAbove: number | null, price: number | null) => freeAbove === null ? baseFee : price === null || !validAmount(price) ? null : price >= freeAbove ? 0 : baseFee;

/** The checked-in evidence is a dated administrator-policy observation, not a
 * live quote. Only the exact mall, code and setting name may use that evidence. */
export function resolveShippingPolicy(mall: Channel, code: string, name: string | null, price: number | null): ProductPreviewShipping | null {
  if (policies.schemaVersion !== 1 || !Number.isFinite(Date.parse(policies.checkedAt))) return null;
  const policy = policies.policies.find(row => row.mall === mall && row.code === code && row.name === name);
  if (!policy || !policy.methods.length || policy.methods.some(method => !validAmount(method.baseFee) || (method.freeAbove !== null && (!validAmount(method.freeAbove) || method.freeAbove === 0)))) return null;
  const methods: ProductPreviewShippingMethod[] = policy.methods.map(method => ({
    code: method.code, name: method.name, baseFee: method.baseFee, freeAbove: method.freeAbove,
    fee: feeAt(method.baseFee, method.freeAbove, price),
    description: method.freeAbove !== null
      ? `${formatAmount(method.freeAbove)} 미만 ${formatAmount(method.baseFee)}, 이상 기본배송비 무료`
      : method.baseFee === 0 ? '기본배송비 무료' : `구매금액과 관계없이 기본배송비 ${formatAmount(method.baseFee)}`,
  }));
  const defaultMethod = methods.find(method => method.code === policy.defaultMethod);
  if (!defaultMethod) return null;
  return {
    mallId: mall, code, name: policy.name, fee: defaultMethod.fee, baseFee: defaultMethod.baseFee,
    freeAbove: defaultMethod.freeAbove, defaultMethod: defaultMethod.code,
    description: `${defaultMethod.name} · 상품 1개, 옵션·추가상품·할인 미적용 기준입니다. 배송지 추가요금은 별도입니다.`,
    methods, checkedAt: policies.checkedAt, sourceUrl: policy.sourceUrl,
    priceBasis: policy.priceBasis, additionalFeeNote: policy.additionalFeeNote,
    policySource: 'current-policy', verification: policies.verification,
    additionalInfo: [...policy.additionalInfo], payment: policy.payment,
    chargeGrouping: policy.chargeGrouping,
  };
}
