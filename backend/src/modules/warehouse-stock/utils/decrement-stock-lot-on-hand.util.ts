import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { WarehouseStockLot, Prisma } from '../../../../generated/prisma/client';

export const decrementStockLotOnHandInTx = async (
  tx: Prisma.TransactionClient,
  stockLotId: string,
  quantity = 1,
  insufficientMessage = 'No units remaining on this lot',
): Promise<WarehouseStockLot> => {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new BadRequestException('Quantity must be a positive integer');
  }

  const decremented = await tx.warehouseStockLot.updateMany({
    where: {
      id: stockLotId,
      status: 'spremno_za_izdavanje',
      quantityOnHand: { gte: quantity },
    },
    data: { quantityOnHand: { decrement: quantity } },
  });
  if (decremented.count !== 1) {
    throw new BadRequestException(insufficientMessage);
  }

  await tx.warehouseStockLot.updateMany({
    where: {
      id: stockLotId,
      status: 'spremno_za_izdavanje',
      quantityOnHand: 0,
    },
    data: { status: 'zatvoreno' },
  });
  const lot = await tx.warehouseStockLot.findUnique({ where: { id: stockLotId } });
  if (!lot) {
    throw new NotFoundException('Stock lot not found');
  }
  return lot;
};
