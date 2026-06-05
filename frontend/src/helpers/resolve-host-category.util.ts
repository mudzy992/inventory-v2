import type { Category } from '../types';

/** @deprecated Host is equipment.categoryId; use expand-maintenance-catalog helpers instead. */
export const resolveHostCategoryIdForEquipmentCategory = (
  equipmentCategoryId: string,
  _categories: Category[],
  linkedHostIds: Set<string>,
): string | null => (linkedHostIds.has(equipmentCategoryId) ? equipmentCategoryId : null);
