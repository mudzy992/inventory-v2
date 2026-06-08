import type { Prisma } from '../../../generated/prisma/client';

/** MySQL JSON path for object keys that are UUIDs (hyphens require quoting). */
export const buildSpecificationJsonPath = (fieldId: string): string => `$."${fieldId.replace(/"/g, '\\"')}"`;

export const buildSpecificationFieldFilter = (
  fieldId: string,
  value: string,
): Prisma.JsonFilter => ({
  path: buildSpecificationJsonPath(fieldId),
  equals: value,
});
