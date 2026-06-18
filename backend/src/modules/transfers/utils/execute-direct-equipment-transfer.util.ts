import type { Prisma, TransferType } from '../../../../generated/prisma/client';
import { buildEquipmentUpdateOnFinalize } from '../transfer-validation.util';

export interface DirectEquipmentTransferInput {
  equipmentId: string;
  type: TransferType;
  toPersonId?: string | null;
  toWarehouseId?: string | null;
}

export const executeDirectEquipmentTransferInTx = async (
  tx: Prisma.TransactionClient,
  input: DirectEquipmentTransferInput,
): Promise<void> => {
  const equipmentUpdate = buildEquipmentUpdateOnFinalize(
    input.type,
    input.toPersonId ?? null,
    input.toWarehouseId ?? null,
  );
  await tx.equipment.update({
    where: { id: input.equipmentId },
    data: equipmentUpdate,
  });
};
