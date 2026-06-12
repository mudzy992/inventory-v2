import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import type { CategoryFieldDefinition } from './category-fields.util';
import { buildSpecificationFieldFilter } from './json-specification-filter.util';

type UniqueSpecLookupClient = {
  equipment: {
    findFirst: (args: {
      where: {
        categoryId: string;
        specifications: Prisma.JsonFilter;
      };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
};

export const assertUniqueUnitSpecificationValues = async (
  prisma: UniqueSpecLookupClient,
  categoryId: string,
  specifications: Record<string, string>,
  unitFields: CategoryFieldDefinition[],
): Promise<void> => {
  for (const field of unitFields) {
    if (!field.unique) {
      continue;
    }
    const trimmed = specifications[field.id]?.trim() ?? '';
    if (!trimmed) {
      continue;
    }
    const existing = await prisma.equipment.findFirst({
      where: {
        categoryId,
        specifications: buildSpecificationFieldFilter(field.id, trimmed),
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(`Vrijednost za ${field.name} je već zauzeta`);
    }
  }
};
