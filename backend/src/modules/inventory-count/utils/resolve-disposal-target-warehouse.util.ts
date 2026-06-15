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
  if (input.stockLotId) {
    const lotWarehouseId = await deps.loadStockLotWarehouseId(input.stockLotId);
    if (lotWarehouseId) {
      return lotWarehouseId;
    }
  }
  const registrarWarehouseId = await deps.resolveRegistrarWarehouseId();
  if (registrarWarehouseId) {
    return registrarWarehouseId;
  }
  const transferWarehouseId = await deps.loadLastZaduzenjeFromWarehouseId(input.equipmentId);
  if (transferWarehouseId) {
    return transferWarehouseId;
  }
  if (input.currentHolderId) {
    return deps.resolveHolderWarehouseId(input.currentHolderId);
  }
  return null;
};
