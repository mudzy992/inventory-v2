import type { CategoryKind } from '../../../../generated/prisma/client';

export type WarehouseScopeEquipment = {
  id: string;
  categoryId: string;
  status: string;
  warehouseId: string | null;
  currentHolder: { id: string; orgUnitId: string } | null;
  category?: { categoryKind: CategoryKind } | null;
  warehouse?: { cityId: string } | null;
};

export type CommitteeScopeInput = {
  categoryId: string;
  warehouseId: string | null;
  sessionOrgUnitId: string;
};

export type CommitteeScopeDeps = {
  expandCategoryIds: (categoryIds: string[]) => Promise<Set<string>>;
  resolveEquipmentCityId: (equipment: WarehouseScopeEquipment) => Promise<string | null>;
  getEffectiveLocationForOrgUnit: (orgUnitId: string) => Promise<string | null>;
  getWarehouseCityId: (warehouseId: string) => Promise<string | null>;
  expandOrgUnitIds: (rootIds: string[]) => Promise<string[]>;
  getWarehouseOrgUnitId: (warehouseId: string) => Promise<string | null>;
  resolveEmployeeWarehouseId: (employeeId: string) => Promise<string | null>;
};

export async function isEmployeeInWarehouseCoverage(
  expandOrgUnitIds: (rootIds: string[]) => Promise<string[]>,
  warehouseOrgUnitId: string | null,
  employeeOrgUnitId: string,
): Promise<boolean> {
  if (!warehouseOrgUnitId) {
    return true;
  }
  const subtree = await expandOrgUnitIds([warehouseOrgUnitId]);
  return subtree.includes(employeeOrgUnitId);
}

export async function matchesWarehouseEquipmentScope(
  deps: Pick<CommitteeScopeDeps, 'resolveEmployeeWarehouseId'>,
  warehouseId: string,
  equipment: WarehouseScopeEquipment,
): Promise<boolean> {
  if (equipment.status === 'skladiste') {
    return equipment.warehouseId === warehouseId;
  }
  if (equipment.status === 'zaduzeno' && equipment.currentHolder?.id) {
    const effectiveWarehouseId = await deps.resolveEmployeeWarehouseId(equipment.currentHolder.id);
    return effectiveWarehouseId === warehouseId;
  }
  return false;
}

export async function evaluateEquipmentInCommitteeScope(
  deps: CommitteeScopeDeps,
  committee: CommitteeScopeInput,
  equipment: WarehouseScopeEquipment,
): Promise<boolean> {
  if (equipment.status === 'rashodovano' || equipment.status === 'za_rashod') {
    return false;
  }
  if (equipment.category?.categoryKind === 'MAINTENANCE') {
    return false;
  }
  const committeeCategoryIds = await deps.expandCategoryIds([committee.categoryId]);
  if (!committeeCategoryIds.has(equipment.categoryId)) {
    return false;
  }
  if (committee.warehouseId) {
    return matchesWarehouseEquipmentScope(deps, committee.warehouseId, equipment);
  }
  const sessionCityId = await deps.getEffectiveLocationForOrgUnit(committee.sessionOrgUnitId);
  if (!sessionCityId) {
    return false;
  }
  const equipmentCityId = await deps.resolveEquipmentCityId(equipment);
  return equipmentCityId === sessionCityId;
}

export async function filterEquipmentInCommitteeScope<T extends WarehouseScopeEquipment>(
  deps: CommitteeScopeDeps,
  committee: CommitteeScopeInput,
  equipmentRows: T[],
): Promise<T[]> {
  const result: T[] = [];
  for (const item of equipmentRows) {
    if (await evaluateEquipmentInCommitteeScope(deps, committee, item)) {
      result.push(item);
    }
  }
  return result;
}

export async function countEquipmentInWarehouseCategoryScope(
  deps: CommitteeScopeDeps,
  committee: CommitteeScopeInput,
  equipmentRows: WarehouseScopeEquipment[],
): Promise<number> {
  let count = 0;
  for (const item of equipmentRows) {
    if (await evaluateEquipmentInCommitteeScope(deps, committee, item)) {
      count += 1;
    }
  }
  return count;
}
