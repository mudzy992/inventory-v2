import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client';

export const claimDisposalApprovalReviewInTx = async (
  tx: Prisma.TransactionClient,
  approvalId: string,
  data: Prisma.DisposalInventoryApprovalUncheckedUpdateManyInput,
): Promise<void> => {
  const claim = await tx.disposalInventoryApproval.updateMany({
    where: { id: approvalId, status: 'pending' },
    data,
  });
  if (claim.count !== 1) {
    throw new BadRequestException('Approval already reviewed');
  }
};
