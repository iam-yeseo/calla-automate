import type { Category } from './types';

export interface CategoryLevel { parentCode: string; value: string; options: Category[] }

// Each level comes from the saved parent relationship. Changing a parent emits
// that parent's code, so an unrelated child can never remain selected.
export function categoryLevels(categories: Category[], value: string): CategoryLevel[] {
  const levels: CategoryLevel[] = [];
  let parentCode = '';
  for (let depth = 1; depth <= 4; depth++) {
    const code = value.slice(0, depth * 3);
    const options = categories.filter(c => c.parentCode === parentCode);
    if (!options.length && depth > 2) break;
    const selected = options.find(c => c.code === code);
    levels.push({ parentCode, value: selected?.code || '', options });
    if (!selected) break;
    parentCode = selected.code;
  }
  if (levels.length === 1) levels.push({ parentCode: '', value: '', options: [] });
  return levels;
}

export function categoryRows(categories: Category[], parentCode: string, query: string): Category[] {
  const search = query.trim().toLowerCase();
  return categories.filter(category => {
    if (!search) return category.parentCode === parentCode;
    if (parentCode && !category.code.startsWith(parentCode)) return false;
    const names = categories.filter(c => category.code.startsWith(c.code)).map(c => c.name).join(' ');
    return `${names} ${category.code}`.toLowerCase().includes(search);
  });
}
