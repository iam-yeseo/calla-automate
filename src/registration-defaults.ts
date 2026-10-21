import type { Channel } from './types';

export const DELIVERY_DEFAULT_NAMES: Record<Channel, string> = {
  retail: '배송방법',
  wholesale: '칼라배송',
};

export const GUIDE_DEFAULT_NAMES = {
  delivery: '배송안내 - 기본',
  as: 'AS안내 - 기본',
  refund: '환불안내 - 기본',
} as const;
