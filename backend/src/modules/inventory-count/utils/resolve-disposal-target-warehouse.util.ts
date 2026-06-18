export type ResolveDisposalTargetWarehouseInput = {
  equipmentId: string;
  status: string;
  warehouseId: string | null;
  stockLotId: string | null;
  currentHolderId: string | null;
};

export type ResolveDisposalTargetWarehouseDeps = {
  loadStockLotWarehouseId: (stockLotId: string) => Promise<string | null>;
  loadLastZaduzenjeFromWarehouseId: (equipmentId: string) => Promise<string | null>;
  resolveRegistrarWarehouseId: () => Promise<string | null>;
  resolveHolderWarehouseId: (employeeId: string) => Promise<string | null>;
};

export const resolveDisposalTargetWarehouseId = async (
  input: ResolveDisposalTargetWarehouseInput,
  deps: ResolveDisposalTargetWarehouseDeps,
): Promise<string | null> => {
  if (input.status === 'skladiste' && input.warehouseId) {
    return input.warehouseId;
  }
  if (input.currentHolderId) {
    const holderWarehouseId = await deps.resolveHolderWarehouseId(input.currentHolderId);
    if (holderWarehouseId) {
      return holderWarehouseId;
    }
  }
  if (input.stockLotId) {
    const lotWarehouseId = await deps.loadStockLotWarehouseId(input.stockLotId);
    if (lotWarehouseId) {
      return lotWarehouseId;
    }
  }
  const transferWarehouseId = await deps.loadLastZaduzenjeFromWarehouseId(input.equipmentId);
  if (transferWarehouseId) {
    return transferWarehouseId;
  }
  const registrarWarehouseId = await deps.resolveRegistrarWarehouseId();
  if (registrarWarehouseId) {
    return registrarWarehouseId;
  }
  return null;
};
