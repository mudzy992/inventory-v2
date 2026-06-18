export interface DisposalWarehouseEligibilityInput {
  status: string;
  warehouseId: string | null;
}

export const isEquipmentEligibleForDisposalMark = (
  input: DisposalWarehouseEligibilityInput,
): boolean => input.status === 'skladiste' && input.warehouseId !== null;
