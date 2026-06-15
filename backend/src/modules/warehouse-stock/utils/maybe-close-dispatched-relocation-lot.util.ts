import type { Prisma } from '../../../../generated/prisma/client';

export const maybeCloseDispatchedRelocationLotInTx = async (
  tx: Prisma.TransactionClient,
  lotId: string,
): Promise<void> => {
  const lot = await tx.warehouseStockLot.findUnique({
    where: { id: lotId },
    select: { quantityOnHand: true, quantityReceived: true, status: true },
  });
  if (!lot || lot.status === 'zatvoreno') {
    return;
  }
  if (lot.quantityOnHand === 0 && lot.quantityReceived > 0) {
    await tx.warehouseStockLot.update({
      where: { id: lotId },
      data: { status: 'zatvoreno' },
    });
  }
};
