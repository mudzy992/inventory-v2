import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client';

export type TransferOpenStatus = 'raw' | 'printed' | 'uploaded';
export type TransferStore = Pick<Prisma.TransactionClient, 'transfer'>;

export const transitionOpenTransferInTx = async (
  transferStore: TransferStore,
  transferId: string,
  allowedStatuses: readonly TransferOpenStatus[],
  data: Prisma.TransferUncheckedUpdateManyInput,
  errorMessage: string,
): Promise<void> => {
  const transition = await transferStore.transfer.updateMany({
    where: { id: transferId, status: { in: [...allowedStatuses] } },
    data,
  });
  if (transition.count !== 1) {
    throw new BadRequestException(errorMessage);
  }
};

export const claimTransferForFinalizeInTx = async (
  transferStore: TransferStore,
  transferId: string,
  data: Prisma.TransferUncheckedUpdateManyInput,
): Promise<void> =>
  transitionOpenTransferInTx(
    transferStore,
    transferId,
    ['raw', 'printed', 'uploaded'],
    data,
    'Transfer is no longer available for finalization',
  );
