import type { Category } from '../../types';

export const CATEGORY_GUARD_MESSAGES = {
  deleteHasChildren: 'Nije moguće obrisati kategoriju koja ima podkategorije. Prvo obrišite podkategorije.',
  deleteHasEquipment: 'Nije moguće obrisati kategoriju koja sadrži opremu.',
} as const;

export interface CategoryDeleteGuardResult {
  allowed: boolean;
  reason?: string;
}

export const canDeleteCategory = (
  categoryId: string,
  categories: Category[],
  equipmentCount: number,
): CategoryDeleteGuardResult => {
  const hasSubCategories = categories.some((row) => row.parentId === categoryId);
  if (hasSubCategories) {
    return { allowed: false, reason: CATEGORY_GUARD_MESSAGES.deleteHasChildren };
  }
  if (equipmentCount > 0) {
    return { allowed: false, reason: CATEGORY_GUARD_MESSAGES.deleteHasEquipment };
  }
  return { allowed: true };
};
