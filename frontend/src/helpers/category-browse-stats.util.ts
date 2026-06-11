import type { Category } from '../types';

export interface CategoryBrowseStats {
  lotCount: number;
  qty: number;
}

interface CategoryBrowseRow {
  categoryId: string;
}

export const buildParentCategoryStats = <T extends CategoryBrowseRow>(
  items: T[],
  categories: Category[],
  getQuantity: (item: T) => number,
): Map<string, CategoryBrowseStats> => {
  const map = new Map<string, CategoryBrowseStats>();
  for (const item of items) {
    const category = categories.find((row) => row.id === item.categoryId);
    const rootId = category?.parentId ?? item.categoryId;
    const existing = map.get(rootId) ?? { lotCount: 0, qty: 0 };
    existing.lotCount += 1;
    existing.qty += getQuantity(item);
    map.set(rootId, existing);
  }
  return map;
};

export const buildSubCategoryStats = <T extends CategoryBrowseRow>(
  items: T[],
  categories: Category[],
  parentId: string,
  getQuantity: (item: T) => number,
): Map<string, CategoryBrowseStats> => {
  const map = new Map<string, CategoryBrowseStats>();
  for (const item of items) {
    if (item.categoryId === parentId) {
      continue;
    }
    const category = categories.find((row) => row.id === item.categoryId);
    if (category?.parentId !== parentId) {
      continue;
    }
    const existing = map.get(item.categoryId) ?? { lotCount: 0, qty: 0 };
    existing.lotCount += 1;
    existing.qty += getQuantity(item);
    map.set(item.categoryId, existing);
  }
  return map;
};
