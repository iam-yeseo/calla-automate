import { api, put } from './api';
import { core } from './domain';
import type { Product } from './types';

const uploads = new WeakMap<File, Map<string, Record<string, unknown>>>();
export async function loadPreviewProduct(itemId: string): Promise<Product> {
  const { item } = await api<{ item: Product }>(`/items/${itemId}`);
  return { ...item, automation: core.normalize(item.automation) };
}

export async function savePreviewProduct(product: Product, file?: File): Promise<Product> {
  let item = structuredClone(product);
  if (file) {
    let cached = uploads.get(file)?.get(item.id);
    if (!cached) {
      const form = new FormData();
      form.append('listId', item.list_id); form.append('itemId', item.id); form.append('file', file);
      cached = await api<Record<string, unknown>>('/uploads', { method: 'POST', body: form });
      const byItem = uploads.get(file) || new Map<string, Record<string, unknown>>();
      byItem.set(item.id, cached); uploads.set(file, byItem);
    }
    item.image_url = String(cached.url);
    item.automation.thumbnail = { ...item.automation.thumbnail, ...cached };
  }
  const result = await put<{ item: Product }>(`/items/${item.id}`, { item, revision: product.updated_at });
  return { ...result.item, automation: core.normalize(result.item.automation) };
}
