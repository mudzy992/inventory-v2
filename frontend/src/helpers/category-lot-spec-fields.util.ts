import type { Category, CategoryField } from '../types';

export const getLotSpecFieldsForCategory = (category: Category | undefined): CategoryField[] => {
  if (!category) {
    return [];
  }
  return category.optionalFields;
};

export const getUnitSpecFieldsForCategory = (category: Category | undefined): CategoryField[] => {
  if (!category) {
    return [];
  }
  return category.fields;
};

export const buildLegacySpecsPayload = (
  fields: CategoryField[],
  values: Record<string, string>,
): Record<string, string> => {
  const payload: Record<string, string> = {};
  for (const field of fields) {
    const value = values[field.id]?.trim() ?? '';
    if (value) {
      payload[field.id] = value;
    }
  }
  return payload;
};

export const pickLotSpecificationValues = (
  values: Record<string, string>,
  fields: CategoryField[],
): Record<string, string> => {
  const payload: Record<string, string> = {};
  for (const field of fields) {
    payload[field.id] = values[field.id]?.trim() ?? '';
  }
  return payload;
};
