import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client';
import type { CategoryFieldDefinition } from '../../../common/utils/category-fields.util';
import { inheritDestLotSpecificationsInTx } from '../../employee-relocation/utils/inherit-dest-lot-specifications.util';
import { applyDestAcceptLotUpdatesInTx } from '../../employee-relocation/utils/relocation-lot-accounting.util';
import { maybeCloseDispatchedRelocationLotInTx } from './maybe-close-dispatched-relocation-lot.util';
import { resolveCanonicalDestLotInTx } from './resolve-canonical-dest-lot.util';

export type FindOrCreateDestLotInput = {
  destWarehouseId: string;
  categoryId: string;
  catalogItemId: string;
  catalogItemName: string;
  actorUserId: string;
};

export type ApplyCrossWarehouseIssueInput = FindOrCreateDestLotInput & {
  equipmentId: string;
  sourceLotId: string;
  sourceWarehouseId: string;
  fields: CategoryFieldDefinition[];
  optionalFields: CategoryFieldDefinition[];
};

export const findOrCreateDestLotInTx = async (
  tx: Prisma.TransactionClient,
  input: FindOrCreateDestLotInput,
) => {
  const resolved = await resolveCanonicalDestLotInTx(tx, input);
  return resolved.lot;
};

export const applyCrossWarehouseIssueLotUpdatesInTx = async (
  tx: Prisma.TransactionClient,
  input: ApplyCrossWarehouseIssueInput,
): Promise<{ destStockLotId: string }> => {
  if (!input.catalogItemId) {
    throw new BadRequestException('Source lot must have catalog item for cross-warehouse issue');
  }
  const destLot = await findOrCreateDestLotInTx(tx, input);
  const lotUpdate = await applyDestAcceptLotUpdatesInTx(tx, {
    equipment: { status: 'zaduzeno', stockLotId: input.sourceLotId },
    fromWarehouseId: input.sourceWarehouseId,
    destStockLotId: destLot.id,
  });
  await inheritDestLotSpecificationsInTx(tx, {
    destLotId: lotUpdate.destStockLotId,
    sourceStockLotId: lotUpdate.sourceStockLotId,
    destWarehouseId: input.destWarehouseId,
    catalogItemId: lotUpdate.catalogItemId,
    categoryId: input.categoryId,
    fields: input.fields,
    optionalFields: input.optionalFields,
    actorUserId: input.actorUserId,
  });
  await tx.equipment.update({
    where: { id: input.equipmentId },
    data: {
      stockLotId: lotUpdate.destStockLotId,
      catalogItemId: lotUpdate.catalogItemId,
    },
  });
  await maybeCloseDispatchedRelocationLotInTx(tx, lotUpdate.destStockLotId);
  return { destStockLotId: lotUpdate.destStockLotId };
};
