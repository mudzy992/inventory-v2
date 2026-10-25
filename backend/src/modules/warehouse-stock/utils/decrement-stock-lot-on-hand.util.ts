import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client';

export const decrementStockLotOnHandInTx = async (
  tx: Prisma.TransactionClient,
  stockLotId: string,
): Promise<void> => {
  const decremented = await tx.warehouseStockLot.updateMany({
    where: {
      id: stockLotId,
      status: 'spremno_za_izdavanje',
      quantityOnHand: { gt: 0 },
    },
    data: { quantityOnHand: { decrement: 1 } },
  });
  if (decremented.count !== 1) {
    throw new BadRequestException('No units remaining on this lot');
  }

  await tx.warehouseStockLot.updateMany({
    where: {
      id: stockLotId,
      status: 'spremno_za_izdavanje',
      quantityOnHand: 0,
    },
    data: { status: 'zatvoreno' },
  });
};
