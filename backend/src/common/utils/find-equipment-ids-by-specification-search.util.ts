import type { PrismaClient } from '../../../generated/prisma/client';

const escapeLikePattern = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

type PrismaQueryClient = Pick<PrismaClient, '$queryRaw'>;

export const findEquipmentIdsBySpecificationSearch = async (
  prisma: PrismaQueryClient,
  searchTerm: string,
  categoryId?: string,
): Promise<string[]> => {
  const trimmed = searchTerm.trim();
  if (!trimmed) {
    return [];
  }
  const pattern = `%${escapeLikePattern(trimmed)}%`;
  // NOTE: table/column names below are quoted for PostgreSQL, which folds unquoted
  // identifiers to lowercase (unlike MySQL, which is case-insensitive for column names).
  // Prisma's @@map("equipment") keeps the table name lowercase (no quoting required there),
  // but the "categoryId" column is camelCase and must be double-quoted or Postgres will
  // look for a column named "categoryid" and fail.
  // `specifications::text` replaces MySQL's `CAST(specifications AS CHAR)`.
  if (categoryId) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM equipment
      WHERE "categoryId" = ${categoryId}
        AND specifications::text LIKE ${pattern}
    `;
    return rows.map((row) => row.id);
  }
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM equipment
    WHERE specifications::text LIKE ${pattern}
  `;
  return rows.map((row) => row.id);
};
