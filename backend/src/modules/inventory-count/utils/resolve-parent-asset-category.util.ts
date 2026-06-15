import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client';

type CategoryReader = {
  findUnique: (args: {
    where: { id: string };
    select: { id: true; parentId: true; categoryKind: true };
  }) => Promise<{ id: string; parentId: string | null; categoryKind: string } | null>;
};

export const resolveParentAssetCategoryId = async (
  reader: CategoryReader,
  categoryId: string,
): Promise<string> => {
  let currentId: string | null = categoryId;
  let lastAssetId: string | null = null;
  while (currentId) {
    const row = await reader.findUnique({
      where: { id: currentId },
      select: { id: true, parentId: true, categoryKind: true },
    });
    if (!row) {
      break;
    }
    if (row.categoryKind !== 'ASSET') {
      throw new BadRequestException('Only ASSET category equipment can be marked for disposal');
    }
    lastAssetId = row.id;
    if (row.parentId === null) {
      return row.id;
    }
    currentId = row.parentId;
  }
  if (!lastAssetId) {
    throw new BadRequestException('Category not found');
  }
  return lastAssetId;
};

export const resolveParentAssetCategoryIdInTx = async (
  tx: Prisma.TransactionClient,
  categoryId: string,
): Promise<string> => resolveParentAssetCategoryId(tx.category, categoryId);
