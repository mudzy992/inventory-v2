import type { Prisma } from '../../../../generated/prisma/client';

interface StockLotCommissionLotInput {
  id: string;
  warehouseId: string;
  categoryId: string;
  catalogItemId: string | null;
}

interface StockLotCommissionInput {
  lot: StockLotCommissionLotInput;
  receipt: { contractNumber: string | null; entryDate: Date };
  inventoryNumber: string;
  mergedSpecifications: Record<string, string>;
}

export type StockLotCommissionResult = {
  equipmentId: string;
};

export const executeStockLotCommissionInTx = async (
  tx: Prisma.TransactionClient,
  input: StockLotCommissionInput,
): Promise<StockLotCommissionResult> => {
  const equipment = await tx.equipment.create({
    data: {
      categoryId: input.lot.categoryId,
      catalogItemId: input.lot.catalogItemId,
      stockLotId: input.lot.id,
      inventoryNumber: input.inventoryNumber,
      specifications: input.mergedSpecifications,
      contractNumber: input.receipt.contractNumber,
      entryDate: input.receipt.entryDate,
      status: 'skladiste',
      currentHolderId: null,
      warehouseId: input.lot.warehouseId,
      warehouseCondition: 'na_skladistu',
    },
  });
  return { equipmentId: equipment.id };
};
