import type { CategoryFieldDefinition } from './category-fields.util';
import { parseCategoryFields } from './category-fields.util';

export interface UniqueFieldDisplay {
  label: string;
  value: string;
}

export const buildEquipmentDisplayName = (
  categoryName: string,
  specifications: Record<string, string>,
): string => {
  const spec = Object.values(specifications)
    .filter(Boolean)
    .slice(0, 2)
    .join(', ');
  return [categoryName, spec].filter(Boolean).join(' — ');
};

export const getUniqueFieldDisplay = (
  fields: unknown,
  optionalFields: unknown,
  specifications: Record<string, string>,
): UniqueFieldDisplay | null => {
  const all = [
    ...parseCategoryFields(fields),
    ...parseCategoryFields(optionalFields),
  ];
  const uniqueField = all.find((field) => field.unique);
  if (!uniqueField) {
    return null;
  }
  const value = specifications[uniqueField.id]?.trim();
  if (!value) {
    return null;
  }
  return { label: uniqueField.name, value };
};

export const buildLabeledSpecifications = (
  fields: unknown,
  optionalFields: unknown,
  specifications: Record<string, string>,
): Record<string, string> => {
  const all: CategoryFieldDefinition[] = [
    ...parseCategoryFields(fields),
    ...parseCategoryFields(optionalFields),
  ];
  const result: Record<string, string> = {};
  for (const field of all) {
    const value = specifications[field.id]?.trim();
    if (value) {
      result[field.name] = value;
    }
  }
  return result;
};
