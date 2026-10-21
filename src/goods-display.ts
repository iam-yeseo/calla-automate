import type { RemoteGoods } from './godomall-types';

export function goodsStock(goods: Pick<RemoteGoods, 'stockMode' | 'stock' | 'soldOut'>) {
  return {
    unlimited: goods.stockMode === 'n',
    soldOut: goods.soldOut === 'y' || goods.stockMode === 'y' && goods.stock !== null && goods.stock <= 0,
  };
}

export function goodsRegularPrice(goods: Pick<RemoteGoods, 'fields'>): number | null {
  const raw = goods.fields.fixedPrice?.trim();
  if (!raw || !/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
