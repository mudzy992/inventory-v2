import type { PrismaService } from '../../prisma/prisma.service';

export interface EffectiveFieldUpdate {
  id: string;
  nextValue: string | null;
}

type EffectiveDenormalizedField = 'effectiveSignerId' | 'effectiveLocationCityId';

const CHUNK_SIZE = 50;

export const applyEffectiveOrgUnitUpdates = async (
  prisma: PrismaService,
  field: EffectiveDenormalizedField,
  updates: EffectiveFieldUpdate[],
): Promise<void> => {
  if (updates.length === 0) {
    return;
  }
  for (let offset = 0; offset < updates.length; offset += CHUNK_SIZE) {
    const chunk = updates.slice(offset, offset + CHUNK_SIZE);
    await prisma.$transaction(
      chunk.map((row) => {
        if (field === 'effectiveSignerId') {
          return prisma.orgUnit.update({
            where: { id: row.id },
            data: { effectiveSignerId: row.nextValue },
          });
        }
        return prisma.orgUnit.update({
          where: { id: row.id },
          data: { effectiveLocationCityId: row.nextValue },
        });
      }),
    );
  }
};
