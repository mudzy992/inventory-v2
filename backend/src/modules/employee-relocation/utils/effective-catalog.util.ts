export type EquipmentCatalogSource = {
  catalogItemId?: string | null;
  stockLot?: { catalogItemId?: string | null } | null;
};

export const getEffectiveCatalogItemId = (equipment: EquipmentCatalogSource): string | null =>
  equipment.catalogItemId ?? equipment.stockLot?.catalogItemId ?? null;

export const isLineMissingCatalog = (equipment: EquipmentCatalogSource): boolean =>
  getEffectiveCatalogItemId(equipment) === null;
