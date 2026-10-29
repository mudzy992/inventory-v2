import type { AuthUser, CatalogState, Equipment, TransferType } from '@/types/models';
import { getEffectiveCityForOrgUnit } from './signer';

const resolveWarehouseForOrg = (
  catalog: CatalogState,
  orgUnitId: string,
  cityId?: string | null,
): string | undefined => {
  const byId = new Map(catalog.orgUnits.map((unit) => [unit.id, unit]));
  const active = catalog.warehouses.filter((row) => row.isActive !== false);
  let currentId: string | null = orgUnitId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const matches = active
      .filter((row) => row.orgUnitId === currentId)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (matches[0]) {
      return matches[0].id;
    }
    currentId = byId.get(currentId)?.parentId ?? null;
  }
  if (cityId) {
    const cityFallback = active
      .filter((row) => row.cityId === cityId)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (cityFallback[0]) {
      return cityFallback[0].id;
    }
  }
  return undefined;
};

const evidenticarWarehouse = (equipment: Equipment, user: AuthUser): string | undefined => {
  const matches = (user.registrarScopes ?? []).filter((row) => row.categoryId === equipment.categoryId);
  const modeA = matches.find((row) => !row.orgUnitId);
  return (modeA ?? matches[0])?.warehouseId;
};

export const resolveTransferWarehousePayload = (
  type: TransferType,
  equipment: Equipment,
  user: AuthUser | null,
  catalog: CatalogState,
): { fromWarehouseId?: string; toWarehouseId?: string } => {
  if (type === 'zaduzenje' && equipment.warehouseId) {
    return { fromWarehouseId: equipment.warehouseId };
  }
  if (type !== 'razduzenje') {
    return {};
  }
  if (user?.role === 'evidenticar') {
    const assigned = evidenticarWarehouse(equipment, user);
    if (assigned) {
      return { toWarehouseId: assigned };
    }
  }
  const holderOrg = equipment.currentHolder?.orgUnitId;
  const cityId = holderOrg ? getEffectiveCityForOrgUnit(catalog.orgUnits, holderOrg) : null;
  const target = holderOrg
    ? resolveWarehouseForOrg(catalog, holderOrg, cityId)
    : undefined;
  const toWarehouseId = target ?? equipment.warehouseId ?? undefined;
  return toWarehouseId ? { toWarehouseId } : {};
};
