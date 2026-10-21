import { useEffect, useState } from 'react';
import { Icon } from './ui';

export default function ProductThumbnail({ url, file }: { url?: string; file?: File }) {
  const [preview, setPreview] = useState(''), [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const next = URL.createObjectURL(file); setPreview(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  const source = preview || url;
  useEffect(() => setFailed(false), [source]);
  return <span className="product-table-thumbnail">{source && !failed
    ? <img src={source} alt="상품 썸네일" loading="lazy" onError={() => setFailed(true)} />
    : <span role="img" aria-label="썸네일 없음"><Icon name="photo" /></span>}</span>;
}
