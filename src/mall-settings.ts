import type { Brand, Channel, Product, Registration, Settings } from './types';
import { core } from './domain';

export const mallBrands = (settings: Settings, mall: Channel): Brand[] => settings.brandsByMall?.[mall] || [];
export function resolveBrand(product: Product, settings: Settings, mall: Channel): string {
  const rows = mallBrands(settings, mall), explicit = product.automation.brandCodes?.[mall];
  if (explicit !== undefined) return rows.some(row => row.code === explicit) ? explicit : '';
  const matches = rows.filter(row => core.matchBrand([row], product.brand));
  return matches.length === 1 ? matches[0].code : '';
}
export function registrationBlocked(product: Product, regs: Registration[], mall: Channel): string | null {
  if (product[`need_${mall}`] !== '필요') return '등록 불필요';
  const reg = regs.find(r => r.item_id === product.id && r.channel === mall);
  if (reg?.api_state === 'needs_review' || reg?.api_state === 'verifying' || reg?.status === 'running') return '기존 결과 확인 필요';
  if (reg?.api_state !== 'deleted' && (reg?.goods_no || reg?.status === 'success' || reg?.api_state === 'verified')) return '이미 등록 완료';
  if (product.done && reg?.api_state !== 'deleted') return '완료 표시된 상품';
  return null;
}
