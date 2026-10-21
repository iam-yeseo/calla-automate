import { DELIVERY_DEFAULT_NAMES, GUIDE_DEFAULT_NAMES } from '../src/registration-defaults';
import { GodomallClient } from './godomall-client';
import { GodomallError } from './godomall-xml';

export interface InsertDefaults {
  deliverySno: string;
  detailInfoDelivery: string;
  detailInfoAS: string;
  detailInfoRefund: string;
}

const normalizedName = (name: string) => name.trim().replace(/\s+/g, ' ');

export async function resolveInsertDefaults(client: GodomallClient): Promise<InsertDefaults> {
  const result = {} as InsertDefaults;
  const settings = [
    ['deliverySno', 'delivery', DELIVERY_DEFAULT_NAMES[client.mall]],
    ['detailInfoDelivery', 'deliveryInfo', GUIDE_DEFAULT_NAMES.delivery],
    ['detailInfoAS', 'asInfo', GUIDE_DEFAULT_NAMES.as],
    ['detailInfoRefund', 'refundInfo', GUIDE_DEFAULT_NAMES.refund],
  ] as const;
  // Keep lookups sequential: each Code_Search call uses the mall's shared rate gate.
  for (const [field, kind, name] of settings) {
    const matches = (await client.codes(kind)).filter(row => normalizedName(row.name) === normalizedName(name));
    if (matches.length !== 1 || !/^\d{1,30}$/.test(matches[0].code) || /^0+$/.test(matches[0].code)) {
      throw new GodomallError(422, `${client.mall === 'retail' ? '소매몰' : '도매몰'}에서 기본 설정 '${name}'을 하나로 확인할 수 없습니다. 고도몰 관리자 설정을 확인해 주세요.`, 'registration_default_unavailable');
    }
    result[field] = matches[0].code;
  }
  return result;
}
