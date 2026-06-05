import type { Category, CategoryField } from '../types';

export const getLotSpecFieldsForCategory = (category: Category | undefined): CategoryField[] => {
  if (!category) {
    return [];
  }
  return [...category.fields, ...category.optionalFields].filter((field) => !field.unique);
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
