import type { Prisma } from '../../../../generated/prisma/client';

export type DeleteInventorySessionCascadeInput = {
  tx: Prisma.TransactionClient;
  sessionId: string;
};

export const deleteInventorySessionCascadeInTx = async (
  input: DeleteInventorySessionCascadeInput,
): Promise<void> => {
  const listItems = await input.tx.equipmentDisposalListItem.findMany({
    where: { sessionId: input.sessionId },
    select: { equipmentId: true },
  });
  const equipmentIds = [...new Set(listItems.map((row) => row.equipmentId))];
  if (equipmentIds.length > 0) {
    await input.tx.equipment.updateMany({
      where: { id: { in: equipmentIds }, status: 'za_rashod' },
      data: { status: 'skladiste' },
    });
  }
  const committees = await input.tx.inventoryCommittee.findMany({
    where: { sessionId: input.sessionId },
    select: { disposalCommissionId: true },
  });
  const commissionIds = [
    ...new Set(
      committees
        .map((row) => row.disposalCommissionId)
        .filter((id): id is string => id !== null),
    ),
  ];
  await input.tx.equipmentDisposalListItem.updateMany({
    where: { sessionId: input.sessionId },
    data: { disposalCommissionId: null, approvalId: null },
  });
  await input.tx.disposalInventoryApproval.deleteMany({
    where: { sessionId: input.sessionId },
  });
  if (commissionIds.length > 0) {
    await input.tx.disposalCommission.deleteMany({
      where: { id: { in: commissionIds } },
    });
  }
  await input.tx.inventorySession.delete({ where: { id: input.sessionId } });
};
