import { getEffectiveCityForOrgUnit, getOrgUnitChildren } from '../helpers';
import type { AppState, Equipment, OrgUnit, RegistrarScopeAssignment, Warehouse } from '../types';

export const getOrgSubtreeIds = (orgUnits: OrgUnit[], rootId: string): Set<string> => {
  const result = new Set<string>();
  const visit = (id: string): void => {
    if (result.has(id)) {
      return;
    }
    result.add(id);
    for (const child of getOrgUnitChildren(orgUnits, id)) {
      visit(child.id);
    }
  };
  visit(rootId);
  return result;
};

export const getWarehousesForOrgUnit = (warehouses: Warehouse[], orgUnitId: string): Warehouse[] =>
  warehouses.filter((row) => row.orgUnitId === orgUnitId);

export const isCentralWarehouse = (warehouse: Warehouse): boolean => !warehouse.orgUnitId;

export const countEquipmentInOrgSubtree = (state: AppState, orgUnitId: string): number => {
  const subtree = getOrgSubtreeIds(state.orgUnits, orgUnitId);
  return state.equipment.filter((item) => {
    if (item.status === 'zaduzeno' && item.currentHolderId) {
      const holder = state.employees.find((employee) => employee.id === item.currentHolderId);
      return holder ? subtree.has(holder.orgUnitId) : false;
    }
    if (item.warehouseId) {
      const warehouse = state.warehouses.find((row) => row.id === item.warehouseId);
      return warehouse?.orgUnitId ? subtree.has(warehouse.orgUnitId) : false;
    }
    return false;
  }).length;
};

export const formatRegistrarAssignmentLabel = (
  assignment: RegistrarScopeAssignment,
  state: AppState,
): string => {
  const warehouse = state.warehouses.find((row) => row.id === assignment.warehouseId);
  const category = state.categories.find((row) => row.id === assignment.categoryId);
  const org = assignment.orgUnitId
    ? state.orgUnits.find((row) => row.id === assignment.orgUnitId)
    : null;
  const mode = assignment.orgUnitId ? 'podstablo' : 'skladište+cat';
  const cityId = warehouse ? warehouse.cityId : null;
  const city = cityId ? state.cities.find((row) => row.id === cityId) : null;
  return `${warehouse?.name ?? 'Skladište'} · ${category?.name ?? 'Kategorija'}${city ? ` · ${city.name}` : ''}${org ? ` · ${org.name}` : ''} (${mode})`;
};

export const getDefaultCityIdForOrgUnit = (orgUnits: OrgUnit[], orgUnitId: string): string | null =>
  getEffectiveCityForOrgUnit(orgUnits, orgUnitId);

export const resolveEffectiveWarehouseForOrgUnit = (
  orgUnits: OrgUnit[],
  warehouses: Warehouse[],
  orgUnitId: string,
  cityId?: string | null,
): string | null => {
  const byId = new Map(orgUnits.map((unit) => [unit.id, unit]));
  const activeWarehouses = warehouses.filter((row) => row.isActive !== false);
  let currentId: string | null = orgUnitId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const matches = activeWarehouses
      .filter((row) => row.orgUnitId === currentId && (!cityId || row.cityId === cityId))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (matches.length > 0) {
      return matches[0]!.id;
    }
    const unit = byId.get(currentId);
    currentId = unit?.parentId ?? null;
  }
  if (cityId) {
    const cityFallback = activeWarehouses
      .filter((row) => row.cityId === cityId)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (cityFallback.length > 0) {
      return cityFallback[0]!.id;
    }
  }
  return null;
};

export const getUserWarehouseIds = (
  role: string | undefined,
  userId: string | undefined,
  scopes: RegistrarScopeAssignment[],
  warehouses: Warehouse[],
): Set<string> => {
  if (role === 'admin') {
    return new Set(warehouses.map((row) => row.id));
  }
  if (role === 'skladistar' && userId) {
    return new Set(
      warehouses
        .filter((row) => row.keepers?.some((keeper) => keeper.userId === userId))
        .map((row) => row.id),
    );
  }
  if (role === 'evidenticar') {
    return new Set(scopes.map((scope) => scope.warehouseId));
  }
  return new Set();
};

export const filterTransfersForWarehouse = (
  warehouseId: string,
  state: AppState,
): typeof state.transfers =>
  state.transfers.filter((transfer) => {
    if (transfer.fromWarehouseId === warehouseId || transfer.toWarehouseId === warehouseId) {
      return true;
    }
    const equipment = state.equipment.find((row) => row.id === transfer.equipmentId);
    return equipment?.warehouseId === warehouseId;
  });

export const filterEquipmentOnWarehouse = (warehouseId: string, equipment: Equipment[]): Equipment[] =>
  equipment.filter((row) => row.warehouseId === warehouseId && row.status === 'skladiste');
