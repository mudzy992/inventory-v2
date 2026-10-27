import { recordConditionalTransition, readTransitionTargetStatus } from '../../../common/metrics/business-transition-metrics.registry';
import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client';

export type ReplaceableInstalledPartStatus = 'active' | 'faulty';

export const transitionInstalledPartInTx = async (
  tx: Prisma.TransactionClient,
  partId: string,
  allowedStatuses: readonly ReplaceableInstalledPartStatus[],
  data: Prisma.EquipmentInstalledPartUpdateManyMutationInput,
  errorMessage: string,
): Promise<void> => {
  const transition = await tx.equipmentInstalledPart.updateMany({
    where: { id: partId, status: { in: [...allowedStatuses] } },
    data,
  });
  recordConditionalTransition('installed_part_status', transition.count, {
    fromStatus: allowedStatuses.join('|'),
    toStatus: readTransitionTargetStatus(data),
  });
  if (transition.count !== 1) {
    throw new BadRequestException(errorMessage);
  }
};
