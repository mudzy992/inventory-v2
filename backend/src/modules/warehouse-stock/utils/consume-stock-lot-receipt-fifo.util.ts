import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client';

export type ConsumeStockLotReceiptFifoResult = {
  entryDate: Date;
  contractNumber: string | null;
};

export const consumeStockLotReceiptFifoInTx = async (
  tx: Prisma.TransactionClient,
  stockLotId: string,
): Promise<ConsumeStockLotReceiptFifoResult> => {
  while (true) {
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

    const claimed = await tx.warehouseStockLotReceipt.updateMany({
      where: { id: receipt.id, quantityRemaining: { gt: 0 } },
      data: { quantityRemaining: { decrement: 1 } },
    });
    if (claimed.count === 1) {
      return { entryDate: receipt.entryDate, contractNumber: receipt.contractNumber };
    }
    // The FIFO batch was exhausted by a concurrent transaction after the read;
    // retry the next currently available receipt rather than decrementing below zero.
  }
};
