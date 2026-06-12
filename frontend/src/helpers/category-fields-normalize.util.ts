import type { CategoryField } from '../types';

export const normalizeUnitCategoryFields = (fields: CategoryField[]): CategoryField[] =>
  fields.map((field) => ({
    ...field,
    required: true,
    unique: field.unique === true,
  }));

export const normalizeLotCategoryFields = (optionalFields: CategoryField[]): CategoryField[] =>
  optionalFields.map((field) => ({
    ...field,
    required: field.required === true,
    unique: false,
  }));
