import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client';
import { allocateTransferDocumentNumberInTx } from '../../transfers/utils/allocate-transfer-document-number.util';
import { isLegacyDocumentNumber } from '../../../common/utils/document-number.util';
import { buildEquipmentUpdateOnFinalize } from '../../transfers/transfer-validation.util';

type FinalizeTx = Prisma.TransactionClient;

export const finalizeInventoryTransferInTx = async (
  tx: FinalizeTx,
  transferId: string,
  finalizedByUserId: string,
): Promise<void> => {
  const transfer = await tx.transfer.findUnique({
    where: { id: transferId },
    select: {
      id: true,
      status: true,
      type: true,
      equipmentId: true,
      toPersonId: true,
      toWarehouseId: true,
      signerId: true,
      date: true,
      scannedDocUrl: true,
      documentNumber: true,
      documentWarehouseId: true,
    },
  });
  if (!transfer) {
    throw new BadRequestException('Transfer not found');
  }
  if (transfer.status === 'potpisan') {
    return;
  }
  if (!transfer.scannedDocUrl) {
    throw new BadRequestException('Signed document upload required before applying inventory transfer');
  }
  const isRashod = transfer.type === 'rashodovanje';
  const documentNumber =
    isLegacyDocumentNumber(transfer.documentNumber) && transfer.documentWarehouseId
      ? await allocateTransferDocumentNumberInTx(
          tx,
          transfer.documentWarehouseId,
          transfer.date,
          isRashod,
        )
      : transfer.documentNumber;
  const equipmentUpdate = buildEquipmentUpdateOnFinalize(
    transfer.type,
    transfer.toPersonId,
    transfer.toWarehouseId,
  );
  await tx.transfer.update({
    where: { id: transferId },
    data: {
      status: 'potpisan',
      documentNumber,
      finalizedByUserId,
    },
  });
  await tx.equipment.update({
    where: { id: transfer.equipmentId },
    data: equipmentUpdate,
  });
};
