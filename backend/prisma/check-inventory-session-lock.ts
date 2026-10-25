import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { Client } from 'pg';
import { lockActiveInventorySessionInTx } from '../src/modules/inventory-count/utils/lock-active-inventory-session-in-tx.util';
import { PrismaService } from '../src/prisma/prisma.service';

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const main = async (): Promise<void> => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ''));
  if (
    process.env.NODE_ENV !== 'test' ||
    !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
    databaseName !== 'inventory_ci'
  ) {
    throw new Error('Inventory session-lock integration check is restricted to the local inventory_ci test database');
  }

  const observerUrl = new URL(databaseUrl);
  observerUrl.searchParams.delete('schema');
  const observer = new Client({ connectionString: observerUrl.toString() });
  const prisma = new PrismaService();
  const orgUnitId = randomUUID();
  const sessionId = randomUUID();
  let prismaConnected = false;
  let observerConnected = false;
  let releaseFirstTransaction: (() => void) | undefined;
  let firstTransaction: Promise<void> | undefined;
  let secondTransaction: Promise<void> | undefined;

  try {
    await prisma.$connect();
    prismaConnected = true;
    await observer.connect();
    observerConnected = true;

    await prisma.orgUnit.create({
      data: { id: orgUnitId, name: `CI lock test ${orgUnitId}`, type: 'direkcija' },
    });
    await prisma.inventorySession.create({
      data: {
        id: sessionId,
        name: `CI active session ${sessionId}`,
        orgUnitId,
        year: 2100,
        status: 'active',
      },
    });

    let signalFirstLockAcquired!: () => void;
    const firstLockAcquired = new Promise<void>((resolve) => {
      signalFirstLockAcquired = resolve;
    });
    const holdFirstTransaction = new Promise<void>((resolve) => {
      releaseFirstTransaction = resolve;
    });

    firstTransaction = prisma.$transaction(
      async (tx) => {
        await lockActiveInventorySessionInTx(tx, sessionId);
        signalFirstLockAcquired();
        await holdFirstTransaction;
        await tx.inventorySession.update({
          where: { id: sessionId },
          data: { status: 'closed' },
        });
      },
      { maxWait: 5_000, timeout: 10_000 },
    );
    await firstLockAcquired;

    secondTransaction = prisma.$transaction(
      async (tx) => {
        await lockActiveInventorySessionInTx(tx, sessionId);
      },
      { maxWait: 5_000, timeout: 10_000 },
    );

    let observedLockWait = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const result = await observer.query<{ waiting: boolean }>(`
        SELECT EXISTS (
          SELECT 1
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND pid <> pg_backend_pid()
            AND wait_event_type = 'Lock'
            AND query ILIKE '%inventory_sessions%'
        ) AS waiting
      `);
      if (result.rows[0]?.waiting) {
        observedLockWait = true;
        break;
      }
      await sleep(25);
    }
    assert.equal(observedLockWait, true, 'the second transaction must wait on the active-session row lock');

    releaseFirstTransaction();
    await firstTransaction;
    await assert.rejects(
      secondTransaction,
      (error: unknown) =>
        error instanceof BadRequestException && error.message === 'Session is not active',
      'a writer waiting behind session close must re-check status and be rejected',
    );

    console.log('Verified PostgreSQL close-vs-record serialization for active inventory sessions.');
  } finally {
    releaseFirstTransaction?.();
    const pendingTransactions = [firstTransaction, secondTransaction].filter(
      (transaction): transaction is Promise<void> => transaction !== undefined,
    );
    await Promise.allSettled(pendingTransactions);
    try {
      if (prismaConnected) {
        await prisma.inventorySession.deleteMany({ where: { id: sessionId } });
        await prisma.orgUnit.deleteMany({ where: { id: orgUnitId } });
      }
    } finally {
      await Promise.all([
        prisma.$disconnect(),
        observerConnected ? observer.end() : Promise.resolve(),
      ]);
    }
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
