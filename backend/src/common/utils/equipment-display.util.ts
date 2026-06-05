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
  const all = getUniqueFieldsDisplay(fields, optionalFields, specifications);
  return all[0] ?? null;
};

export const getUniqueFieldsDisplay = (
  fields: unknown,
  optionalFields: unknown,
  specifications: Record<string, string>,
): UniqueFieldDisplay[] => {
  const all = [
    ...parseCategoryFields(fields),
    ...parseCategoryFields(optionalFields),
  ];
  return all
    .filter((field) => field.unique)
    .map((field) => {
      const value = specifications[field.id]?.trim();
      if (!value) {
        return null;
      }
      return { label: field.name, value };
    })
    .filter((row): row is UniqueFieldDisplay => row !== null);
};

export const buildLabeledSpecifications = (
  fields: unknown,
  optionalFields: unknown,
  specifications: Record<string, string>,
  options?: { excludeUnique?: boolean },
): Record<string, string> => {
  const all: CategoryFieldDefinition[] = [
    ...parseCategoryFields(fields),
    ...parseCategoryFields(optionalFields),
  ];
  const result: Record<string, string> = {};
  for (const field of all) {
    if (options?.excludeUnique && field.unique) {
      continue;
    }
    const value = specifications[field.id]?.trim();
    if (value) {
      result[field.name] = value;
    }
  }
  return result;
};
