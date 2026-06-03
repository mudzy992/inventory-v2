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
  categories: { id: string; parentId: string | null }[],
): { id: string; name: string }[] => {
  const parentIds = new Set(categories.map((row) => row.parentId).filter(Boolean));
  return categories
    .filter((row) => !parentIds.has(row.id))
    .map((row) => ({ id: row.id, name: (row as { name: string }).name }));
};
