import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createPrismaClient } from '../src/prisma/create-prisma-client';
import { buildEffectiveSignerMap } from '../src/common/utils/resolve-effective-signer.util';

config({ path: resolve(__dirname, '../../.env') });

const isDryRun = process.argv.includes('--dry-run');

const main = async (): Promise<void> => {
  const prisma = createPrismaClient();
  const units = await prisma.orgUnit.findMany({
    select: { id: true, parentId: true, signerId: true, name: true, effectiveSignerId: true },
  });
  const nextMap = buildEffectiveSignerMap(units);
  let changed = 0;
  for (const unit of units) {
    const nextValue = nextMap.get(unit.id) ?? null;
    if (nextValue === unit.effectiveSignerId) {
      continue;
    }
    changed += 1;
    console.log(
      `${isDryRun ? 'DRY' : 'SET'} ${unit.name}: effectiveSignerId ${unit.effectiveSignerId ?? 'null'} → ${nextValue ?? 'null'}`,
    );
    if (!isDryRun) {
      await prisma.orgUnit.update({
        where: { id: unit.id },
        data: { effectiveSignerId: nextValue },
      });
    }
  }
  console.log(
    `Gotovo: ${changed} org. jedinica ${isDryRun ? 'bi bilo ažurirano' : 'ažurirano'} (od ${units.length}).`,
  );
  await prisma.$disconnect();
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
