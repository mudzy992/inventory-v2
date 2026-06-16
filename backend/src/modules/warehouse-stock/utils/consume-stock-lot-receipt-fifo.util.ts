import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../../../../generated/prisma/client';

export type ConsumeStockLotReceiptFifoResult = {
  entryDate: Date;
  contractNumber: string | null;
};

export const consumeStockLotReceiptFifoInTx = async (
  tx: Prisma.TransactionClient,
  stockLotId: string,
): Promise<ConsumeStockLotReceiptFifoResult> => {
  const receipt = await tx.warehouseStockLotReceipt.findFirst({
    where: { stockLotId, quantityRemaining: { gt: 0 } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  if (!receipt) {
    const lot = await tx.warehouseStockLot.findUnique({ where: { id: stockLotId } });
    if (!lot) {
      throw new NotFoundException('Stock lot not found');
    }
    throw new BadRequestException('Stock lot has no receipt batches remaining');
  }
  await tx.warehouseStockLotReceipt.update({
    where: { id: receipt.id },
    data: { quantityRemaining: { decrement: 1 } },
  });
  return { entryDate: receipt.entryDate, contractNumber: receipt.contractNumber };
};

