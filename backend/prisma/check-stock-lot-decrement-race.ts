import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { decrementStockLotOnHandInTx } from '../src/modules/warehouse-stock/utils/decrement-stock-lot-on-hand.util';
import { PrismaService } from '../src/prisma/prisma.service';

const main = async (): Promise<void> => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ''));
  if (
    process.env.NODE_ENV !== 'test' ||
    !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
    databaseName !== 'inventory_ci'
  ) {
    throw new Error('Stock-lot race integration check is restricted to the local inventory_ci test database');
  }

  const prisma = new PrismaService();
  const cantonId = randomUUID();
  const cityId = randomUUID();
  const warehouseId = randomUUID();
  const categoryId = randomUUID();
  const userId = randomUUID();
  const stockLotId = randomUUID();
  let connected = false;

  try {
    await prisma.$connect();
    connected = true;

    await prisma.canton.create({ data: { id: cantonId, name: `CI canton ${cantonId}` } });
    await prisma.city.create({ data: { id: cityId, name: `CI city ${cityId}`, cantonId } });
    await prisma.warehouse.create({
      data: {
        id: warehouseId,
        name: `CI warehouse ${warehouseId}`,
        cityId,
        address: 'CI race test',
      },
    });
    await prisma.category.create({
      data: {
        id: categoryId,
        name: `CI category ${categoryId}`,
        description: 'CI stock-lot race test',
        fields: [],
      },
    });
    await prisma.user.create({
      data: {
        id: userId,
        username: `ci-stock-${userId}`,
        passwordHash: 'ci-test-only',
        role: 'admin',
      },
    });
    await prisma.warehouseStockLot.create({
      data: {
        id: stockLotId,
        warehouseId,
        categoryId,
        productName: `CI stock ${stockLotId}`,
        quantityReceived: 1,
        quantityOnHand: 1,
        status: 'spremno_za_izdavanje',
        entryDate: new Date('2100-01-01T00:00:00.000Z'),
        receivedByUserId: userId,
      },
    });

    let enteredTransactions = 0;
    let releaseRace!: () => void;
    const bothTransactionsReady = new Promise<void>((resolve) => {
      releaseRace = resolve;
    });
    const issueOneUnit = () =>
      prisma.$transaction(
        async (tx) => {
          enteredTransactions += 1;
          if (enteredTransactions === 2) releaseRace();
          await bothTransactionsReady;
          return decrementStockLotOnHandInTx(
            tx,
            stockLotId,
            1,
            'Insufficient quantity on stock lot',
          );
        },
        { maxWait: 5_000, timeout: 10_000 },
      );

    const results = await Promise.allSettled([issueOneUnit(), issueOneUnit()]);
    const succeeded = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(succeeded.length, 1, 'exactly one concurrent request may issue the final unit');
    assert.equal(rejected.length, 1, 'the competing request must not oversell the lot');
    if (rejected[0]?.status === 'rejected') {
      assert.ok(rejected[0].reason instanceof BadRequestException);
      assert.equal(rejected[0].reason.message, 'Insufficient quantity on stock lot');
    }

    const finalLot = await prisma.warehouseStockLot.findUniqueOrThrow({ where: { id: stockLotId } });
    assert.equal(finalLot.quantityOnHand, 0);
    assert.equal(finalLot.status, 'zatvoreno');

    console.log('Verified PostgreSQL prevents concurrent issuance of the final stock-lot unit.');
  } finally {
    try {
      if (connected) {
        await prisma.warehouseStockLot.deleteMany({ where: { id: stockLotId } });
        await prisma.user.deleteMany({ where: { id: userId } });
        await prisma.category.deleteMany({ where: { id: categoryId } });
        await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
        await prisma.city.deleteMany({ where: { id: cityId } });
        await prisma.canton.deleteMany({ where: { id: cantonId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
