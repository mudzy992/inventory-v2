import {
  resolveEffectiveWarehouseId,
  type OrgUnitWarehouseRow,
  type WarehouseRow,
} from './resolve-effective-warehouse.util';

export const collectOrgUnitIdsForEffectiveWarehouse = (
  warehouseId: string,
  orgUnits: OrgUnitWarehouseRow[],
  warehouses: WarehouseRow[],
  locationResolver?: (orgUnitId: string) => string | null,
): Set<string> => {
  const result = new Set<string>();
  for (const unit of orgUnits) {
    const cityId = locationResolver?.(unit.id) ?? null;
    const resolved = resolveEffectiveWarehouseId(unit.id, orgUnits, warehouses, cityId);
    if (resolved === warehouseId) {
      result.add(unit.id);
    }
  }
  return result;
};

export const intersectOrgUnitIdSets = (a: Set<string>, b: Set<string>): string[] => {
  const result: string[] = [];
  for (const id of a) {
    if (b.has(id)) {
      result.push(id);
    }
  }
  return result;
};
