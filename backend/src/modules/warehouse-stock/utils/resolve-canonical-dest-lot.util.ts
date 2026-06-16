import type { Prisma } from '../../../../generated/prisma/client';
import {
  findCanonicalStockLotInTx,
  type CanonicalStockLotResult,
} from './find-canonical-stock-lot.util';
import { resolveReopenedLotStatus } from './resolve-reopened-lot-status.util';

export type ResolveCanonicalDestLotInput = {
  destWarehouseId: string;
  categoryId: string;
  catalogItemId: string;
  catalogItemName: string;
  actorUserId: string;
};

export type ResolveCanonicalDestLotResult = {
  lot: CanonicalStockLotResult;
  created: boolean;
  reopened: boolean;
};

export const resolveCanonicalDestLotInTx = async (
  tx: Prisma.TransactionClient,
  input: ResolveCanonicalDestLotInput,
): Promise<ResolveCanonicalDestLotResult> => {
  const canonical = await findCanonicalStockLotInTx(tx, {
    warehouseId: input.destWarehouseId,
    catalogItemId: input.catalogItemId,
  });
  if (!canonical) {
    const created = await tx.warehouseStockLot.create({
      data: {
        warehouseId: input.destWarehouseId,
        categoryId: input.categoryId,
        catalogItemId: input.catalogItemId,
        lotKind: 'ISSUABLE',
        productName: input.catalogItemName,
        quantityReceived: 0,
        quantityOnHand: 0,
        status: 'ceka_specifikaciju',
        incomingRelocation: true,
        receivedByUserId: input.actorUserId,
        entryDate: new Date(),
      },
    });
    return { lot: created, created: true, reopened: false };
  }
  if (canonical.status === 'zatvoreno') {
    const reopened = await tx.warehouseStockLot.update({
      where: { id: canonical.id },
      data: {
        status: resolveReopenedLotStatus(canonical),
        incomingRelocation: true,
      },
    });
    return { lot: reopened, created: false, reopened: true };
  }
  return { lot: canonical, created: false, reopened: false };
};
