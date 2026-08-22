import type { Prisma } from '../../../generated/prisma/client';

/**
 * JSON path for a `specifications` object key, used with Prisma's advanced Json filtering.
 *
 * NOTE: the `path` option has a different shape per connector:
 *  - MySQL connector expects a JSON path *string*, e.g. `$."field-id"`.
 *  - PostgreSQL connector expects an array of path segments, e.g. `["field-id"]`.
 * fieldId values are UUIDs (never contain `.` or `[`), so a single-segment path is always correct
 * for both connectors — this array form is the PostgreSQL-compatible one.
 */
export const buildSpecificationJsonPath = (fieldId: string): string[] => [fieldId];

export const buildSpecificationFieldFilter = (
  fieldId: string,
  value: string,
): Prisma.JsonFilter => ({
  path: buildSpecificationJsonPath(fieldId),
  equals: value,
});
