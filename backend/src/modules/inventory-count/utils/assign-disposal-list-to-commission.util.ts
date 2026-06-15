import type { Prisma } from '../../../../generated/prisma/client';

type AssignInput = {
  sessionId: string;
  warehouseId: string;
  parentCategoryId: string;
  disposalCommissionId: string;
};

export const assignListedDisposalItemsToCommissionInTx = async (
  tx: Prisma.TransactionClient,
  input: AssignInput,
): Promise<number> => {
  const listItems = await tx.equipmentDisposalListItem.findMany({
    where: {
      sessionId: input.sessionId,
      warehouseId: input.warehouseId,
      categoryId: input.parentCategoryId,
      status: 'listed',
    },
    include: {
      equipment: { select: { id: true, status: true, inventoryNumber: true } },
    },
  });
  let assigned = 0;
  for (const item of listItems) {
    if (item.equipment.status !== 'skladiste') {
      continue;
    }
    const approval = await tx.disposalInventoryApproval.upsert({
      where: {
        equipmentId_disposalCommissionId: {
          equipmentId: item.equipmentId,
          disposalCommissionId: input.disposalCommissionId,
        },
      },
      create: {
        equipmentId: item.equipmentId,
        disposalCommissionId: input.disposalCommissionId,
        sessionId: input.sessionId,
        status: 'pending',
      },
      update: {
        status: 'pending',
        reviewedByUserId: null,
        reviewNote: null,
        reviewedAt: null,
      },
    });
    await tx.equipmentDisposalListItem.update({
      where: { id: item.id },
      data: {
        status: 'assigned',
        disposalCommissionId: input.disposalCommissionId,
        approvalId: approval.id,
      },
    });
    assigned += 1;
  }
  return assigned;
};
