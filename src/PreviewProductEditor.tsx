import ProductEditor from './ProductEditor';
import type { Channel, Product, Settings } from './types';

export default function PreviewProductEditor({ product, settings, busy = false, error, applyLabel, onCancel, onSave }: {
  product: Product; settings: Settings; mall: Channel; busy?: boolean; error?: string; applyLabel?: string;
  onCancel(): void; onSave(product: Product, file?: File): Promise<void>;
}) {
  return <div className="preview-edit-workspace">
    {error && <div className="alert error" role="alert">{error}</div>}
    <ProductEditor key={`${product.id}:${product.updated_at || ''}`} product={product} settings={settings} embedded busy={busy} applyLabel={applyLabel} onClose={onCancel} onApply={onSave} />
  </div>;
}
