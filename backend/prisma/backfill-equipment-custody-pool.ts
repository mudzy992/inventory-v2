import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createPrismaClient } from '../src/prisma/create-prisma-client';

config({ path: resolve(__dirname, '../../.env') });

const isDryRun = process.argv.includes('--dry-run');

const main = async (): Promise<void> => {
  const prisma = createPrismaClient();
  const candidates = await prisma.equipment.findMany({
    where: {
      status: 'skladiste',
      custodyOrgUnitId: null,
    },
    select: {
      id: true,
      inventoryNumber: true,
      warehouseId: true,
    },
  });
  let updated = 0;
  let skipped = 0;
  for (const equipment of candidates) {
    const lastRazduzenje = await prisma.transfer.findFirst({
      where: {
        equipmentId: equipment.id,
        type: 'razduzenje',
        status: 'potpisan',
        fromPersonId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        fromPerson: { select: { id: true, orgUnitId: true, firstName: true, lastName: true } },
      },
    });
    const orgUnitId = lastRazduzenje?.fromPerson?.orgUnitId ?? null;
    if (!orgUnitId) {
      skipped += 1;
      console.log(
        `SKIP ${equipment.inventoryNumber ?? equipment.id} — nema finaliziranog razduženja s radnikom`,
      );
      continue;
    }
    const holder = lastRazduzenje.fromPerson!;
    console.log(
      `${isDryRun ? 'DRY' : 'SET'} ${equipment.inventoryNumber ?? equipment.id} → custodyOrgUnitId=${orgUnitId} (${holder.firstName} ${holder.lastName})`,
    );
    if (!isDryRun) {
      await prisma.equipment.update({
        where: { id: equipment.id },
        data: { custodyOrgUnitId: orgUnitId },
      });
    }
    updated += 1;
  }
  console.log(
    `Gotovo: ${updated} ${isDryRun ? 'bi bilo ažurirano' : 'ažurirano'}, ${skipped} preskočeno, ${candidates.length} kandidata.`,
  );
  await prisma.$disconnect();
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
