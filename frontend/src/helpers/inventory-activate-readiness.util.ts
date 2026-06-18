import type { Warehouse } from '../types';

export const findWarehousesBlockingInventoryActivate = (
  warehouses: Warehouse[],
  sessionWarehouseIds: string[],
): Warehouse[] => {
  if (sessionWarehouseIds.length === 0) {
    return [];
  }
  const sessionWarehouseIdSet = new Set(sessionWarehouseIds);
  return warehouses.filter((warehouse) => {
    if (!sessionWarehouseIdSet.has(warehouse.id) || warehouse.isActive === false) {
      return false;
    }
    const keepers = warehouse.keepers ?? [];
    if (keepers.length === 0) {
      return true;
    }
    return !keepers.some((keeper) => Boolean(keeper.user?.employeeId));
  });
};
