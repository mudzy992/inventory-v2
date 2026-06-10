import { getEffectiveCityForOrgUnit } from '../helpers';
import type { AppState, Equipment, TransferType, UserAccount } from '../types';
import { resolveEffectiveWarehouseForOrgUnit } from './org-warehouse.util';
import { getMatchingAssignmentsForEquipment } from './registrar-scope';

const pickAssignmentWarehouse = (
  equipment: Equipment,
  user: UserAccount,
  state: AppState,
): string | undefined => {
  const matches = getMatchingAssignmentsForEquipment(equipment, user, state);
  const modeA = matches.find((row) => !row.orgUnitId);
  if (modeA) {
    return modeA.warehouseId;
  }
  return matches[0]?.warehouseId;
};

const resolveRazduzenjeWarehouseId = (
  equipment: Equipment,
  user: UserAccount | null,
  state: AppState,
): string | undefined => {
  if (user?.role === 'evidenticar') {
    const assignmentWarehouse = pickAssignmentWarehouse(equipment, user, state);
    if (assignmentWarehouse) {
      return assignmentWarehouse;
    }
  }
  const holder =
    equipment.currentHolder ??
    (equipment.currentHolderId
      ? state.employees.find((row) => row.id === equipment.currentHolderId)
      : undefined);
  const effectiveOrgWarehouse = holder
    ? resolveEffectiveWarehouseForOrgUnit(
        state.orgUnits,
        state.warehouses,
        holder.orgUnitId,
        getEffectiveCityForOrgUnit(state.orgUnits, holder.orgUnitId),
      )
    : undefined;
  return effectiveOrgWarehouse ?? equipment.warehouseId ?? undefined;
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
