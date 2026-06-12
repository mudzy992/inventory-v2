import type { CategoryField } from '../types';

export const isRegistrarLockedEquipmentSpecField = (
  field: Pick<CategoryField, 'unique'>,
): boolean => field.unique === true;

export const mergeRegistrarEquipmentSpecifications = (
  existing: Record<string, string>,
  edited: Record<string, string>,
  fields: CategoryField[],
  _optionalFields: CategoryField[],
): Record<string, string> => {
  const merged = { ...edited };
  for (const field of fields) {
    if (!isRegistrarLockedEquipmentSpecField(field)) {
      continue;
    }
    merged[field.id] = existing[field.id] ?? '';
  }
  return merged;
};
