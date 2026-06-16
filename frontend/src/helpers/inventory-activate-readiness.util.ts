import type { Warehouse } from '../types';

export const findWarehousesBlockingInventoryActivate = (
  warehouses: Warehouse[],
  cityId: string | null | undefined,
): Warehouse[] => {
  if (!cityId) {
    return [];
  }
  return warehouses.filter((warehouse) => {
    if (warehouse.cityId !== cityId || warehouse.isActive === false) {
      return false;
    }
    const keepers = warehouse.keepers ?? [];
    if (keepers.length === 0) {
      return true;
    }
    return !keepers.some((keeper) => Boolean(keeper.user?.employeeId));
  });
};
