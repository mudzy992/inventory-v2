import type { WarehouseStockLotStatus } from '../types';

export const getStockLotStatusLabel = (status: WarehouseStockLotStatus): string => {
  if (status === 'ceka_specifikaciju') {
    return 'Čeka specifikaciju';
  }
  if (status === 'spremno_za_izdavanje') {
    return 'Spremno za izdavanje';
  }
  return 'Zatvoreno';
};

export const getLeafCategories = (
  categories: { id: string; parentId: string | null; name: string; categoryKind?: string }[],
): { id: string; name: string; categoryKind?: string }[] => {
  const parentIds = new Set(categories.map((row) => row.parentId).filter(Boolean));
  return categories
    .filter((row) => !parentIds.has(row.id))
    .map((row) => ({ id: row.id, name: row.name, categoryKind: row.categoryKind }));
};

export const getAssetLeafCategories = (
  categories: { id: string; parentId: string | null; name: string; categoryKind?: string }[],
): { id: string; name: string }[] =>
  getLeafCategories(categories)
    .filter((row) => (row.categoryKind ?? 'ASSET') === 'ASSET')
    .map((row) => ({ id: row.id, name: row.name }));
