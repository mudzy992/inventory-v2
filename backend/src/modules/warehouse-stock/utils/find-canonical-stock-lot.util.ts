import type { Prisma } from '../../../../../generated/prisma/client';

export type FindCanonicalStockLotInput = {
  warehouseId: string;
  catalogItemId: string;
};

export type CanonicalStockLotResult = {
  id: string;
  warehouseId: string;
  categoryId: string;
  catalogItemId: string | null;
  lotKind: 'ISSUABLE' | 'MAINTENANCE';
  productName: string;
  incomingRelocation: boolean;
  quantityReceived: number;
  quantityOnHand: number;
  status: 'ceka_specifikaciju' | 'spremno_za_izdavanje' | 'zatvoreno';
  specifications: Prisma.JsonValue;
  contractNumber: string | null;
  entryDate: Date;
  notes: string | null;
  receivedByUserId: string;
  specDefinedByUserId: string | null;
  specDefinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const findCanonicalStockLotInTx = async (
  tx: Prisma.TransactionClient,
  input: FindCanonicalStockLotInput,
): Promise<CanonicalStockLotResult | null> => {
  const openLot = await tx.warehouseStockLot.findFirst({
    where: {
      warehouseId: input.warehouseId,
      catalogItemId: input.catalogItemId,
      lotKind: 'ISSUABLE',
      status: { not: 'zatvoreno' },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (openLot) {
    return openLot;
  }
  const lastClosed = await tx.warehouseStockLot.findFirst({
    where: {
      warehouseId: input.warehouseId,
      catalogItemId: input.catalogItemId,
      lotKind: 'ISSUABLE',
      status: 'zatvoreno',
    },
    orderBy: { createdAt: 'desc' },
  });
  return lastClosed ?? null;
};

