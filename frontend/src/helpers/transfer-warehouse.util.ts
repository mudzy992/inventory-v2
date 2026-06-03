import { getEffectiveCityForOrgUnit } from '../helpers';
import type { AppState, Equipment, TransferType, UserAccount } from '../types';
import { resolveEffectiveWarehouseForOrgUnit } from './org-warehouse.util';

const categoryMatchesAssignment = (
  categoryId: string,
  assignmentCategoryId: string,
  categories: AppState['categories'],
): boolean => {
  const childrenByParent = new Map<string | null, string[]>();
  for (const category of categories) {
    const siblings = childrenByParent.get(category.parentId) ?? [];
    siblings.push(category.id);
    childrenByParent.set(category.parentId, siblings);
  }
  const expanded = new Set<string>();
  const visit = (id: string): void => {
    if (expanded.has(id)) {
      return;
    }
    expanded.add(id);
    for (const childId of childrenByParent.get(id) ?? []) {
      visit(childId);
    }
  };
  visit(assignmentCategoryId);
  return expanded.has(categoryId);
};

const pickAssignmentWarehouse = (
  equipment: Equipment,
  user: UserAccount,
  state: AppState,
): string | undefined => {
  const assignments = user.registrarScopes ?? [];
  const match = assignments.find((assignment) =>
    categoryMatchesAssignment(equipment.categoryId, assignment.categoryId, state.categories),
  );
  return match?.warehouseId;
};

const resolveRazduzenjeWarehouseId = (
  equipment: Equipment,
  user: UserAccount | null,
  state: AppState,
): string | undefined => {
  const assignmentWarehouse =
    user?.role === 'evidenticar' ? pickAssignmentWarehouse(equipment, user, state) : undefined;
  const holder = equipment.currentHolderId
    ? state.employees.find((row) => row.id === equipment.currentHolderId)
    : undefined;
  const effectiveOrgWarehouse = holder
    ? resolveEffectiveWarehouseForOrgUnit(
        state.orgUnits,
        state.warehouses,
        holder.orgUnitId,
        getEffectiveCityForOrgUnit(state.orgUnits, holder.orgUnitId),
      )
    : undefined;
  return assignmentWarehouse ?? effectiveOrgWarehouse ?? equipment.warehouseId ?? undefined;
};

export const resolveTransferWarehousePayload = (
  type: TransferType,
  equipment: Equipment,
  user: UserAccount | null,
  state: AppState,
): { fromWarehouseId?: string; toWarehouseId?: string } => {
  if (type === 'zaduzenje' && equipment.warehouseId) {
    return { fromWarehouseId: equipment.warehouseId };
  }
  if (type === 'razduzenje') {
    const target = resolveRazduzenjeWarehouseId(equipment, user, state);
    if (target) {
      return { toWarehouseId: target };
    }
  }
  return {};
};
