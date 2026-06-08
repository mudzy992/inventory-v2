import { getEffectiveCityForOrgUnit } from '../helpers';
import type { OrgUnit, Warehouse } from '../types';

export interface OrgUnitWarehouseRow {
  id: string;
  parentId: string | null;
}

export interface WarehouseRow {
  id: string;
  orgUnitId: string | null;
  cityId: string;
  isActive: boolean;
  createdAt: Date | string;
}

export const resolveEffectiveWarehouseId = (
  orgUnitId: string,
  orgUnits: OrgUnitWarehouseRow[],
  warehouses: WarehouseRow[],
  cityId?: string | null,
): string | null => {
  const byId = new Map(orgUnits.map((unit) => [unit.id, unit]));
  const activeWarehouses = warehouses.filter((row) => row.isActive);
  let currentId: string | null = orgUnitId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const matches = activeWarehouses
      .filter((row) => row.orgUnitId === currentId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    if (matches.length > 0) {
      return matches[0]!.id;
    }
    const unit = byId.get(currentId);
    currentId = unit?.parentId ?? null;
  }
  if (cityId) {
    const cityFallback = activeWarehouses
      .filter((row) => row.cityId === cityId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    if (cityFallback.length > 0) {
      return cityFallback[0]!.id;
    }
  }
  return null;
};

export const collectOrgUnitIdsForEffectiveWarehouse = (
  warehouseId: string,
  orgUnits: OrgUnitWarehouseRow[],
  warehouses: WarehouseRow[],
  orgUnitsWithLocation: OrgUnit[],
): Set<string> => {
  const result = new Set<string>();
  for (const unit of orgUnits) {
    const cityId = getEffectiveCityForOrgUnit(orgUnitsWithLocation, unit.id);
    const resolved = resolveEffectiveWarehouseId(unit.id, orgUnits, warehouses, cityId);
    if (resolved === warehouseId) {
      result.add(unit.id);
    }
  }
  return result;
};

export const toWarehouseRows = (warehouses: Warehouse[]): WarehouseRow[] =>
  warehouses.map((row) => ({
    id: row.id,
    orgUnitId: row.orgUnitId ?? null,
    cityId: row.cityId,
    isActive: row.isActive !== false,
    createdAt: row.createdAt ?? '1970-01-01',
  }));

export const toOrgUnitRows = (orgUnits: OrgUnit[]): OrgUnitWarehouseRow[] =>
  orgUnits.map((row) => ({ id: row.id, parentId: row.parentId }));
