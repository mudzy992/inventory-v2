export type PendingRelocationKind = 'relocate_to_warehouse' | 'relocate_to_person';

export interface PendingRelocationEquipmentState {
  status: string;
  warehouseId: string | null;
  currentHolderId: string | null;
}

export const isRelocationAlreadyApplied = (input: {
  kind: PendingRelocationKind;
  equipment: PendingRelocationEquipmentState;
  targetWarehouseId?: string | null;
  targetPersonId?: string | null;
}): boolean => {
  if (input.kind === 'relocate_to_warehouse') {
    return Boolean(
      input.targetWarehouseId &&
        input.equipment.status === 'skladiste' &&
        input.equipment.warehouseId === input.targetWarehouseId &&
        input.equipment.currentHolderId === null,
    );
  }

  return Boolean(
    input.targetPersonId &&
      input.equipment.status === 'zaduzeno' &&
      input.equipment.currentHolderId === input.targetPersonId,
  );
};
