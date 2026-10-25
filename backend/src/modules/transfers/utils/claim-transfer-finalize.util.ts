import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client';

export const claimTransferForFinalizeInTx = async (
  tx: Prisma.TransactionClient,
  transferId: string,
  data: Prisma.TransferUpdateManyMutationInput,
): Promise<void> => {
  const claimed = await tx.transfer.updateMany({
    where: { id: transferId, status: { in: ['raw', 'printed', 'uploaded'] } },
    data,
  });
  if (claimed.count !== 1) {
    throw new BadRequestException('Transfer is no longer available for finalization');
  }
};
