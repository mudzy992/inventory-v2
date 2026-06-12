import { BadRequestException } from '@nestjs/common';
import type { CategoryFieldDefinition } from './category-fields.util';

export const isRegistrarLockedEquipmentSpecField = (
  field: Pick<CategoryFieldDefinition, 'unique'>,
): boolean => field.unique === true;

export const getRegistrarLockedSpecFieldIds = (fields: CategoryFieldDefinition[]): Set<string> => {
  const lockedIds = new Set<string>();
  for (const field of fields) {
    if (isRegistrarLockedEquipmentSpecField(field)) {
      lockedIds.add(field.id);
    }
  }
  return lockedIds;
};

export const resolveRegistrarEquipmentSpecifications = (
  existing: Record<string, string>,
  incoming: Record<string, string>,
  fields: CategoryFieldDefinition[],
  optionalFields: CategoryFieldDefinition[],
): Record<string, string> => {
  const allFields = [...fields, ...optionalFields];
  const lockedIds = getRegistrarLockedSpecFieldIds(fields);
  const merged = { ...incoming };
  for (const fieldId of lockedIds) {
    const previous = existing[fieldId] ?? '';
    const next = incoming[fieldId] ?? '';
    if (next !== previous) {
      const field = allFields.find((row) => row.id === fieldId);
      throw new BadRequestException(
        `Evidentičar ne može mijenjati unikatno polje po komadu: ${field?.name ?? fieldId}`,
      );
    }
    merged[fieldId] = previous;
  }
  return merged;
};
