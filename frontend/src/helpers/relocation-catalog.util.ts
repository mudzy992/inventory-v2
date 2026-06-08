import type { RelocationLine } from '../api/employee-relocation-api';

export const getEffectiveCatalogItemId = (line: RelocationLine): string | null =>
  line.equipment.catalogItemId ?? line.equipment.stockLot?.catalogItemId ?? null;

export const getCatalogDisplayLabel = (line: RelocationLine): string | null => {
  if (line.equipment.catalogItem) {
    return `${line.equipment.catalogItem.code} — ${line.equipment.catalogItem.name}`;
  }
  const catalogId = getEffectiveCatalogItemId(line);
  if (!catalogId && line.equipment.stockLot?.productName) {
    return line.equipment.stockLot.productName;
  }
  return catalogId ? 'Mapirano' : null;
};

export const isRelocationLineMissingCatalog = (line: RelocationLine): boolean =>
  getEffectiveCatalogItemId(line) === null;

export const canMapRelocationCatalog = (line: RelocationLine): boolean =>
  ['pending_source', 'rejected'].includes(line.status);
