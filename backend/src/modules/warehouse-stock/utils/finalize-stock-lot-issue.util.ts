import type { EquipmentAffiliation, Prisma } from '../../../../generated/prisma/client';
import { allocateTransferDocumentNumberInTx } from '../../transfers/utils/allocate-transfer-document-number.util';
import { buildEquipmentUpdateOnFinalize } from '../../transfers/transfer-validation.util';

interface StockLotIssueLotInput {
  id: string;
  warehouseId: string;
  categoryId: string;
  catalogItemId: string | null;
  specifications: Prisma.JsonValue;
}

interface StockLotIssueBaseInput {
  lot: StockLotIssueLotInput;
  receipt: { contractNumber: string | null; entryDate: Date };
  employeeId: string;
  inventoryNumber: string | null;
  isAccountingTracked: boolean;
  affiliation: EquipmentAffiliation;
  mergedSpecifications: Record<string, string>;
}

interface FinalizeStockLotIssueWithTransferInput extends StockLotIssueBaseInput {
  signerId: string;
  createdByUserId: string;
  transferDate: Date;
}

export type StockLotIssueResult = {
  equipmentId: string;
  transferId: string | null;
};

export const executeStockLotIssueDirectInTx = async (
  tx: Prisma.TransactionClient,
  input: StockLotIssueBaseInput,
): Promise<StockLotIssueResult> => {
  const assignment = buildEquipmentUpdateOnFinalize('zaduzenje', input.employeeId, null);
  const equipment = await tx.equipment.create({
    data: {
      categoryId: input.lot.categoryId,
      catalogItemId: input.lot.catalogItemId,
      stockLotId: input.lot.id,
      inventoryNumber: input.inventoryNumber,
      isAccountingTracked: input.isAccountingTracked,
      affiliation: input.affiliation,
      specifications: input.mergedSpecifications,
      contractNumber: input.receipt.contractNumber,
      entryDate: input.receipt.entryDate,
      status: assignment.status,
      currentHolderId: assignment.currentHolderId,
      warehouseId: assignment.warehouseId,
      warehouseCondition: assignment.warehouseCondition,
    },
  });
  return { equipmentId: equipment.id, transferId: null };
};

export const executeStockLotIssueWithTransferInTx = async (
  tx: Prisma.TransactionClient,
  input: FinalizeStockLotIssueWithTransferInput,
): Promise<StockLotIssueResult> => {
  const equipment = await tx.equipment.create({
    data: {
      categoryId: input.lot.categoryId,
      catalogItemId: input.lot.catalogItemId,
      stockLotId: input.lot.id,
      inventoryNumber: input.inventoryNumber,
      isAccountingTracked: input.isAccountingTracked,
      affiliation: input.affiliation,
      specifications: input.mergedSpecifications,
      status: 'skladiste',
      contractNumber: input.receipt.contractNumber,
      entryDate: input.receipt.entryDate,
      warehouseId: input.lot.warehouseId,
      warehouseCondition: 'na_skladistu',
    },
  });
  const documentNumber = await allocateTransferDocumentNumberInTx(
    tx,
    input.lot.warehouseId,
    input.transferDate,
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
      generatedDocxStatus: 'queued',
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

/** @deprecated Use executeStockLotIssueWithTransferInTx */
export const executeStockLotIssueInTx = executeStockLotIssueWithTransferInTx;
