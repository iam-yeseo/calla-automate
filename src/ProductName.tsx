import { core } from './domain';

export default function ProductName({ name, fallback = '상품명 없음' }: { name: string; fallback?: string }) {
  const prefix = core.namePrefix(name);
  return prefix.enabled
    ? <><span className="product-name-prefix">{prefix.text}</span>{' '}{core.displayName(prefix.name)}</>
    : <>{core.displayName(name) || fallback}</>;
}
