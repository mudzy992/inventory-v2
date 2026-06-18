export type InventoryFreezeContext = {
  sessionId: string;
  sessionName: string;
  warehouseId: string;
  warehouseName: string;
  reason: 'active_session' | 'production_lock';
};

export type ResolveEquipmentWarehouseInput = {
  status: string;
  warehouseId: string | null;
  currentHolderId: string | null;
};

export type InventoryFrozenWarehouseDeps = {
  findActiveFreezeForWarehouse: (
    warehouseId: string,
  ) => Promise<InventoryFreezeContext | null>;
  findProductionFreezeForWarehouse: (
    warehouseId: string,
  ) => Promise<InventoryFreezeContext | null>;
  resolveEquipmentWarehouseId: (input: ResolveEquipmentWarehouseInput) => Promise<string | null>;
};

export const findFreezeContextForEquipment = async (
  input: ResolveEquipmentWarehouseInput,
  deps: InventoryFrozenWarehouseDeps,
): Promise<InventoryFreezeContext | null> => {
  const warehouseId = await deps.resolveEquipmentWarehouseId(input);
  if (!warehouseId) {
    return null;
  }
  const activeFreeze = await deps.findActiveFreezeForWarehouse(warehouseId);
  if (activeFreeze) {
    return activeFreeze;
  }
  return deps.findProductionFreezeForWarehouse(warehouseId);
};

export const findFreezeContextForWarehouse = async (
  warehouseId: string,
  deps: Pick<InventoryFrozenWarehouseDeps, 'findActiveFreezeForWarehouse' | 'findProductionFreezeForWarehouse'>,
): Promise<InventoryFreezeContext | null> => {
  const activeFreeze = await deps.findActiveFreezeForWarehouse(warehouseId);
  if (activeFreeze) {
    return activeFreeze;
  }
  return deps.findProductionFreezeForWarehouse(warehouseId);
};
