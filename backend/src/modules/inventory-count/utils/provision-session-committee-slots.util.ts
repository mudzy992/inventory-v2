import type { Prisma } from '../../../../generated/prisma/client';

export type ProvisionSessionCommitteeSlotsInput = {
  tx: Prisma.TransactionClient;
  sessionId: string;
  sessionName: string;
  warehouses: { id: string; name: string; cityId: string }[];
  categories: { id: string; name: string }[];
};

export type ProvisionSessionCommitteeSlotsResult = {
  created: number;
  skipped: number;
};

export const provisionSessionCommitteeSlots = async (
  input: ProvisionSessionCommitteeSlotsInput,
): Promise<ProvisionSessionCommitteeSlotsResult> => {
  const existing = await input.tx.inventoryCommittee.findMany({
    where: { sessionId: input.sessionId },
    select: { warehouseId: true, categoryId: true },
  });
  const existingKeys = new Set(
    existing.map((row) => `${row.warehouseId ?? ''}:${row.categoryId}`),
  );
  let created = 0;
  let skipped = 0;
  for (const warehouse of input.warehouses) {
    for (const category of input.categories) {
      const key = `${warehouse.id}:${category.id}`;
      if (existingKeys.has(key)) {
        skipped += 1;
        continue;
      }
      const disposal = await input.tx.disposalCommission.create({
        data: {
          cityId: warehouse.cityId,
          name: `${input.sessionName} — ${warehouse.name} — ${category.name} — rashod`,
          isActive: true,
        },
      });
      await input.tx.inventoryCommittee.create({
        data: {
          sessionId: input.sessionId,
          warehouseId: warehouse.id,
          categoryId: category.id,
          disposalCommissionId: disposal.id,
          membersConfigured: false,
        },
      });
      existingKeys.add(key);
      created += 1;
    }
  }
  return { created, skipped };
};
