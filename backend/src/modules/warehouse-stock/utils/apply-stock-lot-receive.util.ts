import type { Prisma } from '../../../../generated/prisma/client';

export type ApplyStockLotReceiveInput = {
  warehouseId: string;
  categoryId: string;
  catalogItemId: string | null;
  productName: string;
  quantity: number;
  entryDate: Date;
  contractNumber: string | null;
  notes: string | null;
  receivedByUserId: string;
  statusIfCreated: 'ceka_specifikaciju' | 'spremno_za_izdavanje';
  statusIfReopened: 'ceka_specifikaciju' | 'spremno_za_izdavanje';
};

export const applyStockLotReceiveInTx = async (
  tx: Prisma.TransactionClient,
  lotId: string | null,
  input: ApplyStockLotReceiveInput,
): Promise<{ stockLotId: string }> => {
  if (!lotId) {
    const created = await tx.warehouseStockLot.create({
      data: {
        warehouseId: input.warehouseId,
        categoryId: input.categoryId,
        catalogItemId: input.catalogItemId,
        lotKind: 'ISSUABLE',
        productName: input.productName,
        quantityReceived: input.quantity,
        quantityOnHand: input.quantity,
        status: input.statusIfCreated,
        specifications: {},
        contractNumber: input.contractNumber,
        entryDate: input.entryDate,
        notes: input.notes,
        receivedByUserId: input.receivedByUserId,
      },
    });
    await tx.warehouseStockLotReceipt.create({
      data: {
        stockLotId: created.id,
        quantityReceived: input.quantity,
        quantityRemaining: input.quantity,
        entryDate: input.entryDate,
        contractNumber: input.contractNumber,
        notes: input.notes,
        receivedByUserId: input.receivedByUserId,
      },
    });
    return { stockLotId: created.id };
  }

  const existing = await tx.warehouseStockLot.findUnique({ where: { id: lotId } });
  if (!existing) {
    throw new Error('Canonical stock lot not found');
  }

  const nextStatus =
    existing.status === 'zatvoreno' ? input.statusIfReopened : existing.status;

  await tx.warehouseStockLot.update({
    where: { id: existing.id },
    data: {
      incomingRelocation: false,
      quantityReceived: { increment: input.quantity },
      quantityOnHand: { increment: input.quantity },
      status: nextStatus,
      contractNumber: input.contractNumber,
      entryDate: input.entryDate,
      notes: input.notes ?? existing.notes,
    },
  });

  await tx.warehouseStockLotReceipt.create({
    data: {
      stockLotId: existing.id,
      quantityReceived: input.quantity,
      quantityRemaining: input.quantity,
      entryDate: input.entryDate,
      contractNumber: input.contractNumber,
      notes: input.notes,
      receivedByUserId: input.receivedByUserId,
    },
  });

  return { stockLotId: existing.id };
};

