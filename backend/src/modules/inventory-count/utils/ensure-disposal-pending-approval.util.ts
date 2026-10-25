import type { Prisma } from '../../../../generated/prisma/client';

type ApprovalStore = Pick<Prisma.TransactionClient, 'disposalInventoryApproval'>;

export interface EnsureDisposalPendingApprovalInput {
  equipmentId: string;
  disposalCommissionId: string;
  sessionId: string;
  inventoryLineId: string | null;
}

export const ensureDisposalPendingApproval = async (
  store: ApprovalStore,
  input: EnsureDisposalPendingApprovalInput,
) => {
  const where = {
    equipmentId_disposalCommissionId: {
      equipmentId: input.equipmentId,
      disposalCommissionId: input.disposalCommissionId,
    },
  };
  const existing = await store.disposalInventoryApproval.findUnique({
    where,
    select: { id: true, sessionId: true, status: true },
  });

  if (existing?.sessionId === input.sessionId) {
    if (existing.status === 'pending') {
      // An approval review may race with this retry. The conditional update
      // changes only the line link and cannot reopen an already reviewed row.
      await store.disposalInventoryApproval.updateMany({
        where: { id: existing.id, sessionId: input.sessionId, status: 'pending' },
        data: { inventoryLineId: input.inventoryLineId },
      });
    }
    return store.disposalInventoryApproval.findUniqueOrThrow({
      where: { id: existing.id },
      include: { equipment: { select: { inventoryNumber: true } } },
    });
  }

  // A later inventory session deliberately reopens the approval; retries in
  // the same session take the idempotent branch above and never reset review.
  return store.disposalInventoryApproval.upsert({
    where,
    create: {
      equipmentId: input.equipmentId,
      disposalCommissionId: input.disposalCommissionId,
      sessionId: input.sessionId,
      inventoryLineId: input.inventoryLineId,
      status: 'pending',
    },
    update: {
      sessionId: input.sessionId,
      status: 'pending',
      inventoryLineId: input.inventoryLineId,
      reviewedByUserId: null,
      reviewNote: null,
      reviewedAt: null,
    },
    include: { equipment: { select: { inventoryNumber: true } } },
  });
};
