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
  if (categoryId) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM equipment
      WHERE categoryId = ${categoryId}
        AND CAST(specifications AS CHAR) LIKE ${pattern}
    `;
    return rows.map((row) => row.id);
  }
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM equipment
    WHERE CAST(specifications AS CHAR) LIKE ${pattern}
  `;
  return rows.map((row) => row.id);
};
