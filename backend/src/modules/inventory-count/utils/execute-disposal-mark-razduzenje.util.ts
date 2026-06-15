import type { Prisma } from '../../../../generated/prisma/client';
import { allocateTransferDocumentNumberInTx } from '../../transfers/utils/allocate-transfer-document-number.util';
import { buildEquipmentUpdateOnFinalize } from '../../transfers/transfer-validation.util';
import { resolveDocumentWarehouseId } from '../../transfers/utils/resolve-document-warehouse.util';

export interface RazduzenjeForDisposalInput {
  equipmentId: string;
  fromPersonId: string;
  toWarehouseId: string;
  actorUserId: string;
  signerId: string;
  reason: string;
  createTransferDocument: boolean;
  finalizeWithoutUpload: boolean;
}

export interface RazduzenjeForDisposalResult {
  transferId: string | null;
  finalized: boolean;
}

const buildDraftNumber = (): string => `DRAFT-DISP-${Date.now()}`;

export const executeRazduzenjeForDisposalMarkInTx = async (
  tx: Prisma.TransactionClient,
  input: RazduzenjeForDisposalInput,
): Promise<RazduzenjeForDisposalResult> => {
  const equipmentUpdate = buildEquipmentUpdateOnFinalize('razduzenje', null, input.toWarehouseId);
  if (!input.createTransferDocument) {
    await tx.equipment.update({
      where: { id: input.equipmentId },
      data: equipmentUpdate,
    });
    return { transferId: null, finalized: true };
  }
  const date = new Date();
  const documentWarehouseId = resolveDocumentWarehouseId({
    type: 'razduzenje',
    fromWarehouseId: null,
    toWarehouseId: input.toWarehouseId,
    equipmentWarehouseId: input.toWarehouseId,
  });
  const transfer = await tx.transfer.create({
    data: {
      equipmentId: input.equipmentId,
      type: 'razduzenje',
      fromType: 'osoba',
      fromPersonId: input.fromPersonId,
      toType: 'skladiste',
      toWarehouseId: input.toWarehouseId,
      signerId: input.signerId,
      fromWarehouseId: null,
      toPersonId: null,
      documentWarehouseId,
      createdByUserId: input.actorUserId,
      date,
      reason: input.reason,
      notes: null,
      status: 'raw',
      documentNumber: buildDraftNumber(),
      isCrossServiceTransfer: false,
    },
  });
  if (!input.finalizeWithoutUpload) {
    return { transferId: transfer.id, finalized: false };
  }
  const year = date.getFullYear();
  const documentNumber = await allocateTransferDocumentNumberInTx(
    tx,
    documentWarehouseId,
    year,
    false,
  );
  await tx.transfer.update({
    where: { id: transfer.id },
    data: {
      status: 'potpisan',
      documentNumber,
      finalizedByUserId: input.actorUserId,
    },
  });
  await tx.equipment.update({
    where: { id: input.equipmentId },
    data: equipmentUpdate,
  });
  return { transferId: transfer.id, finalized: true };
};
