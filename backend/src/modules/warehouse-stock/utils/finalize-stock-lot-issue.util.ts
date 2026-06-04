import type { Prisma } from '../../../../generated/prisma/client';
import { allocateTransferDocumentNumberInTx } from '../../transfers/utils/allocate-transfer-document-number.util';
import { buildEquipmentUpdateOnFinalize } from '../../transfers/transfer-validation.util';

interface FinalizeStockLotIssueInput {
  lot: {
    id: string;
    warehouseId: string;
    categoryId: string;
    contractNumber: string | null;
    entryDate: Date;
    specifications: Prisma.JsonValue;
  };
  employeeId: string;
  inventoryNumber: string;
  mergedSpecifications: Record<string, string>;
  signerId: string;
  createdByUserId: string;
  transferDate: Date;
}

export const executeStockLotIssueInTx = async (
  tx: Prisma.TransactionClient,
  input: FinalizeStockLotIssueInput,
): Promise<{ equipmentId: string; transferId: string }> => {
  const equipment = await tx.equipment.create({
    data: {
      categoryId: input.lot.categoryId,
      stockLotId: input.lot.id,
      inventoryNumber: input.inventoryNumber,
      specifications: input.mergedSpecifications,
      status: 'skladiste',
      contractNumber: input.lot.contractNumber,
      entryDate: input.lot.entryDate,
      warehouseId: input.lot.warehouseId,
      warehouseCondition: 'na_skladistu',
    },
  });
  const year = input.transferDate.getFullYear();
  const documentNumber = await allocateTransferDocumentNumberInTx(
    tx,
    input.lot.warehouseId,
    year,
    false,
  );
  const transfer = await tx.transfer.create({
    data: {
      equipmentId: equipment.id,
      type: 'zaduzenje',
      fromType: 'skladiste',
      fromWarehouseId: input.lot.warehouseId,
      documentWarehouseId: input.lot.warehouseId,
      toType: 'osoba',
      toPersonId: input.employeeId,
      signerId: input.signerId,
      createdByUserId: input.createdByUserId,
      finalizedByUserId: input.createdByUserId,
      date: input.transferDate,
      status: 'potpisan',
      documentNumber,
    },
  });
  const equipmentUpdate = buildEquipmentUpdateOnFinalize(
    'zaduzenje',
    input.employeeId,
    null,
  );
  await tx.equipment.update({
    where: { id: equipment.id },
    data: equipmentUpdate,
  });
  return { equipmentId: equipment.id, transferId: transfer.id };
};
