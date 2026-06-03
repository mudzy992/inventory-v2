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
      .filter((row) => row.orgUnitId === currentId && (!cityId || row.cityId === cityId))
      .sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return aTime - bTime;
      });
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
