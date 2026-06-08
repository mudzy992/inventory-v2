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

export const getStockLotListBadge = (
  status: WarehouseStockLotStatus,
  quantityOnHand: number,
  quantityReceived: number,
): { label: string; tone: 'warning' | 'success' | 'neutral' } => {
  if (status === 'ceka_specifikaciju') {
    return { label: getStockLotStatusLabel(status), tone: 'warning' };
  }
  if (status === 'spremno_za_izdavanje' && quantityReceived > 0 && quantityOnHand === 0) {
    return { label: 'Nema više na stanju', tone: 'warning' };
  }
  if (status === 'spremno_za_izdavanje') {
    return { label: getStockLotStatusLabel(status), tone: 'success' };
  }
  return { label: getStockLotStatusLabel(status), tone: 'neutral' };
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
