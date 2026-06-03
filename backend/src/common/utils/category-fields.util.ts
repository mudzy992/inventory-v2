import { BadRequestException } from '@nestjs/common';

export interface CategoryFieldDefinition {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select';
  required: boolean;
  unique: boolean;
  options?: string[];
}

export const parseCategoryFields = (value: unknown): CategoryFieldDefinition[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value as CategoryFieldDefinition[];
};

const validateFieldValues = (
  specifications: Record<string, string>,
  allowedFields: CategoryFieldDefinition[],
): void => {
  const allowedIds = new Set(allowedFields.map((field) => field.id));
  for (const field of allowedFields) {
    if (!field.required) {
      continue;
    }
    const fieldValue = specifications[field.id];
    if (fieldValue === undefined || fieldValue.trim() === '') {
      throw new BadRequestException(`Missing required field: ${field.name}`);
    }
  }
  for (const [key, value] of Object.entries(specifications)) {
    if (!allowedIds.has(key)) {
      throw new BadRequestException(`Unknown specification field: ${key}`);
    }
    const definition = allowedFields.find((field) => field.id === key);
    if (!definition) {
      continue;
    }
    if (definition.type === 'select' && definition.options && !definition.options.includes(value)) {
      throw new BadRequestException(`Invalid option for ${definition.name}`);
    }
    if (definition.type === 'number' && Number.isNaN(Number(value))) {
      throw new BadRequestException(`${definition.name} must be a number`);
    }
    if (definition.type === 'date' && Number.isNaN(Date.parse(value))) {
      throw new BadRequestException(`${definition.name} must be a valid date`);
    }
  }
};

export const validateSpecifications = (
  specifications: Record<string, string>,
  fields: CategoryFieldDefinition[],
  optionalFields: CategoryFieldDefinition[],
): void => {
  validateFieldValues(specifications, [...fields, ...optionalFields]);
};

export const splitCategoryFieldsForStock = (
  fields: CategoryFieldDefinition[],
  optionalFields: CategoryFieldDefinition[],
): { lotFields: CategoryFieldDefinition[]; issueFields: CategoryFieldDefinition[] } => {
  const all = [...fields, ...optionalFields];
  const lotFields = all.filter((field) => !field.unique);
  const issueFields = all.filter((field) => field.unique);
  return { lotFields, issueFields };
};

export const validateLotSpecifications = (
  specifications: Record<string, string>,
  fields: CategoryFieldDefinition[],
  optionalFields: CategoryFieldDefinition[],
): void => {
  const { lotFields } = splitCategoryFieldsForStock(fields, optionalFields);
  validateFieldValues(specifications, lotFields);
};

export const validateIssueSpecifications = (
  specifications: Record<string, string>,
  fields: CategoryFieldDefinition[],
  optionalFields: CategoryFieldDefinition[],
): void => {
  const { issueFields } = splitCategoryFieldsForStock(fields, optionalFields);
  validateFieldValues(specifications, issueFields);
};

export const isLeafCategory = async (
  categoryId: string,
  countChildren: (id: string) => Promise<number>,
): Promise<boolean> => {
  const childCount = await countChildren(categoryId);
  return childCount === 0;
};
