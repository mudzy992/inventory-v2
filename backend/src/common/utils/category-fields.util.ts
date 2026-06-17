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

export const getUnitSpecFields = (fields: CategoryFieldDefinition[]): CategoryFieldDefinition[] =>
  fields;

export const getLotSpecFields = (optionalFields: CategoryFieldDefinition[]): CategoryFieldDefinition[] =>
  optionalFields;

export const normalizeUnitCategoryFields = (
  fields: CategoryFieldDefinition[],
): CategoryFieldDefinition[] =>
  fields.map((field) => ({
    ...field,
    required: true,
    unique: field.unique === true,
  }));

export const normalizeLotCategoryFields = (
  optionalFields: CategoryFieldDefinition[],
): CategoryFieldDefinition[] => {
  for (const field of optionalFields) {
    if (field.unique === true) {
      throw new BadRequestException(`Lot polje ne može biti unikatno: ${field.name}`);
    }
  }
  return optionalFields.map((field) => ({
    ...field,
    required: field.required === true,
    unique: false,
  }));
};

export const hasRequiredLotSpecFields = (optionalFields: CategoryFieldDefinition[]): boolean =>
  optionalFields.some((field) => field.required);

const isSerialFieldName = (name: string): boolean => /serijsk/i.test(name);

export const resolveSerialNumberFromSpecifications = (
  fields: CategoryFieldDefinition[],
  optionalFields: CategoryFieldDefinition[],
  specifications: Record<string, string>,
): string | null => {
  const allFields = [...fields, ...optionalFields];
  const serialField = allFields.find((field) => isSerialFieldName(field.name));
  if (serialField) {
    const value = specifications[serialField.id]?.trim();
    if (value) {
      return value;
    }
  }
  const uniqueField = allFields.find((field) => field.unique);
  if (uniqueField) {
    const value = specifications[uniqueField.id]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
};

const validateFieldValues = (
  specifications: Record<string, string>,
  allowedFields: CategoryFieldDefinition[],
  requiredFields: CategoryFieldDefinition[],
): void => {
  const allowedIds = new Set(allowedFields.map((field) => field.id));
  const requiredIds = new Set(requiredFields.map((field) => field.id));
  for (const field of requiredFields) {
    const fieldValue = specifications[field.id];
    if (fieldValue === undefined || fieldValue.trim() === '') {
      throw new BadRequestException(`Missing required field: ${field.name}`);
    }
  }
  for (const [key, value] of Object.entries(specifications)) {
    if (!allowedIds.has(key)) {
      throw new BadRequestException(`Unknown specification field: ${key}`);
    }
    if (!requiredIds.has(key) && value.trim() === '') {
      continue;
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

export const sanitizeLotSpecifications = (
  specifications: Record<string, string>,
  optionalFields: CategoryFieldDefinition[],
): Record<string, string> => {
  const lotFields = getLotSpecFields(optionalFields);
  const allowedIds = new Set(lotFields.map((field) => field.id));
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(specifications)) {
    if (allowedIds.has(key)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

export const validateLotSpecifications = (
  specifications: Record<string, string>,
  optionalFields: CategoryFieldDefinition[],
): void => {
  const lotFields = getLotSpecFields(optionalFields);
  const requiredLotFields = lotFields.filter((field) => field.required);
  validateFieldValues(specifications, lotFields, requiredLotFields);
};

export const validateIssueSpecifications = (
  specifications: Record<string, string>,
  fields: CategoryFieldDefinition[],
): void => {
  const unitFields = getUnitSpecFields(fields);
  validateFieldValues(specifications, unitFields, unitFields);
};

export const validateEquipmentSpecifications = (
  specifications: Record<string, string>,
  fields: CategoryFieldDefinition[],
  optionalFields: CategoryFieldDefinition[],
): void => {
  const unitFields = getUnitSpecFields(fields);
  const lotFields = getLotSpecFields(optionalFields);
  const requiredFields = [...unitFields, ...lotFields.filter((field) => field.required)];
  validateFieldValues(specifications, [...unitFields, ...lotFields], requiredFields);
};

/** @deprecated Use validateEquipmentSpecifications */
export const validateSpecifications = (
  specifications: Record<string, string>,
  fields: CategoryFieldDefinition[],
  optionalFields: CategoryFieldDefinition[],
): void => {
  validateEquipmentSpecifications(specifications, fields, optionalFields);
};

export const isLeafCategory = async (
  categoryId: string,
  countChildren: (id: string) => Promise<number>,
): Promise<boolean> => {
  const childCount = await countChildren(categoryId);
  return childCount === 0;
};
