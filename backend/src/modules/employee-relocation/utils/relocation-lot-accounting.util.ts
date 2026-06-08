import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client';

export type DestAcceptLotDeltas = {
  destOnHandDelta: number;
  destReceivedDelta: number;
  sourceReceivedDelta: number;
};

export const resolveDestAcceptLotDeltas = (equipmentStatus: string): DestAcceptLotDeltas => ({
  destOnHandDelta: equipmentStatus === 'zaduzeno' ? 0 : 1,
  destReceivedDelta: 1,
  sourceReceivedDelta: -1,
});

export type ApplyDestAcceptLotUpdatesInput = {
  equipment: { status: string; stockLotId: string | null };
  fromWarehouseId: string;
  destStockLotId: string;
};

export type ApplyDestAcceptLotUpdatesResult = {
  sourceStockLotId: string | null;
  destStockLotId: string;
  catalogItemId: string | null;
  deltas: DestAcceptLotDeltas;
};

export const applyDestAcceptLotUpdatesInTx = async (
  tx: Prisma.TransactionClient,
  input: ApplyDestAcceptLotUpdatesInput,
): Promise<ApplyDestAcceptLotUpdatesResult> => {
  const deltas = resolveDestAcceptLotDeltas(input.equipment.status);
  const destLot = await tx.warehouseStockLot.findUnique({ where: { id: input.destStockLotId } });
  if (!destLot) {
    throw new NotFoundException('Destinacijski lot nije pronađen');
  }

  let sourceStockLotId: string | null = input.equipment.stockLotId;
  if (sourceStockLotId) {
    const sourceLot = await tx.warehouseStockLot.findUnique({ where: { id: sourceStockLotId } });
    if (!sourceLot) {
      throw new NotFoundException('Izvorni lot nije pronađen');
    }
    if (sourceLot.warehouseId !== input.fromWarehouseId) {
      throw new BadRequestException('Izvorni lot ne pripada izvornom skladištu');
    }
    if (sourceLot.quantityReceived < 1) {
      throw new BadRequestException('Izvorni lot nema dovoljno primljene količine za transfer');
    }
    await tx.warehouseStockLot.update({
      where: { id: sourceStockLotId },
      data: { quantityReceived: { decrement: 1 } },
    });
  } else {
    sourceStockLotId = null;
  }

  await tx.warehouseStockLot.update({
    where: { id: destLot.id },
    data: {
      incomingRelocation: false,
      quantityReceived: { increment: deltas.destReceivedDelta },
      ...(deltas.destOnHandDelta > 0 ? { quantityOnHand: { increment: deltas.destOnHandDelta } } : {}),
    },
  });

  return {
    sourceStockLotId,
    destStockLotId: destLot.id,
    catalogItemId: destLot.catalogItemId,
    deltas,
  };
};
