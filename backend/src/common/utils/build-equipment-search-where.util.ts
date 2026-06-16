import type { Prisma } from '../../../generated/prisma/client';
import type { CategoryFieldDefinition } from './category-fields.util';
import { buildSpecificationFieldFilter, buildSpecificationJsonPath } from './json-specification-filter.util';

export type BuildEquipmentSearchWhereInput = {
  search?: string;
  specFieldId?: string;
  specValue?: string;
  categoryTextFieldIds?: string[];
  specMatchEquipmentIds?: string[];
  holderMatchEmployeeIds?: string[];
};

export const buildSpecificationTextFieldContainsFilter = (
  fieldId: string,
  searchTerm: string,
): Prisma.EquipmentWhereInput => ({
  specifications: {
    path: buildSpecificationJsonPath(fieldId),
    string_contains: searchTerm,
  },
});

export const buildEquipmentSearchWhere = (
  input: BuildEquipmentSearchWhereInput,
): Prisma.EquipmentWhereInput | null => {
  const searchTerm = input.search?.trim();
  const specFieldId = input.specFieldId?.trim();
  const specValue = input.specValue?.trim();
  const clauses: Prisma.EquipmentWhereInput[] = [];
  if (specFieldId && specValue) {
    clauses.push({ specifications: buildSpecificationFieldFilter(specFieldId, specValue) });
  }
  if (searchTerm) {
    const textClauses: Prisma.EquipmentWhereInput[] = [
      { inventoryNumber: { contains: searchTerm } },
      { contractNumber: { contains: searchTerm } },
      { notes: { contains: searchTerm } },
    ];
    if (input.specMatchEquipmentIds && input.specMatchEquipmentIds.length > 0) {
      textClauses.push({ id: { in: input.specMatchEquipmentIds } });
    }
    if (input.holderMatchEmployeeIds && input.holderMatchEmployeeIds.length > 0) {
      textClauses.push({ currentHolderId: { in: input.holderMatchEmployeeIds } });
    }
    if (input.categoryTextFieldIds && input.categoryTextFieldIds.length > 0) {
      for (const fieldId of input.categoryTextFieldIds) {
        textClauses.push(buildSpecificationTextFieldContainsFilter(fieldId, searchTerm));
      }
    }
    clauses.push({ OR: textClauses });
  }
  if (clauses.length === 0) {
    return null;
  }
  if (clauses.length === 1) {
    return clauses[0]!;
  }
  return { AND: clauses };
};

export const collectCategoryTextFieldIds = (fields: CategoryFieldDefinition[]): string[] =>
  fields
    .filter((field) => field.type === 'text' || field.type === 'number' || field.type === 'select')
    .map((field) => field.id);
