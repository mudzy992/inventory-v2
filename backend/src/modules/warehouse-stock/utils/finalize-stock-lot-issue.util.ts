import type { Prisma } from '../../../../generated/prisma/client';
import {
  buildDocumentNumber,
  countYearlySequences,
} from '../../../common/utils/document-number.util';
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
  const existing = await tx.transfer.findMany({
    where: { documentNumber: { contains: String(year) } },
    select: { documentNumber: true },
  });
  const sequence = countYearlySequences(
    existing.map((row) => row.documentNumber),
    year,
    false,
  );
  const documentNumber = buildDocumentNumber(year, sequence + 1, false);
  const transfer = await tx.transfer.create({
    data: {
      equipmentId: equipment.id,
      type: 'zaduzenje',
      fromType: 'skladiste',
      fromWarehouseId: input.lot.warehouseId,
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
