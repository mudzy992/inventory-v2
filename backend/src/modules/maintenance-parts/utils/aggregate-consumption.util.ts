export interface MaintenanceConsumptionRow {
  maintenanceCategoryId: string;
  maintenanceCategoryName: string;
  hostCategoryId: string | null;
  hostCategoryName: string | null;
  activeQuantity: number;
  faultyQuantity: number;
  removedQuantity: number;
  installedTotal: number;
}

interface PartAggregateInput {
  maintenanceCategoryId: string;
  maintenanceCategoryName: string;
  hostCategoryId: string | null;
  hostCategoryName: string | null;
  quantity: number;
  status: 'active' | 'faulty' | 'removed';
}

export const aggregateMaintenanceConsumption = (
  parts: PartAggregateInput[],
  hostCategoryIdFilter?: string,
): MaintenanceConsumptionRow[] => {
  const map = new Map<string, MaintenanceConsumptionRow>();
  for (const part of parts) {
    if (hostCategoryIdFilter && part.hostCategoryId !== hostCategoryIdFilter) {
      continue;
    }
    const key = `${part.maintenanceCategoryId}:${part.hostCategoryId ?? '_'}`;
    const existing = map.get(key) ?? {
      maintenanceCategoryId: part.maintenanceCategoryId,
      maintenanceCategoryName: part.maintenanceCategoryName,
      hostCategoryId: part.hostCategoryId,
      hostCategoryName: part.hostCategoryName,
      activeQuantity: 0,
      faultyQuantity: 0,
      removedQuantity: 0,
      installedTotal: 0,
    };
    existing.installedTotal += part.quantity;
    if (part.status === 'active') {
      existing.activeQuantity += part.quantity;
    } else if (part.status === 'faulty') {
      existing.faultyQuantity += part.quantity;
    } else {
      existing.removedQuantity += part.quantity;
    }
    map.set(key, existing);
  }
  return [...map.values()].sort((a, b) =>
    a.maintenanceCategoryName.localeCompare(b.maintenanceCategoryName),
  );
};
