import type { InventoryCommitteeDto } from '../../api/inventory-api';

export const getCommitteeDisplayLabel = (committee: InventoryCommitteeDto): string => {
  const warehouseName = committee.warehouse?.name ?? (committee.warehouseId ? committee.warehouseId : '—');
  const categoryName = committee.category?.name ?? committee.categoryId;
  if (committee.warehouseId || committee.warehouse) {
    return `${warehouseName} — ${categoryName}`;
  }
  return categoryName;
};
