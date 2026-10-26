import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { InventoryCountService } from '../src/modules/inventory-count/inventory-count.service';
import { PrismaService } from '../src/prisma/prisma.service';

const main = async (): Promise<void> => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ''));
  if (
    process.env.NODE_ENV !== 'test' ||
    !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
    databaseName !== 'inventory_ci'
  ) {
    throw new Error('Manual close retry race check is restricted to the local inventory_ci test database');
  }

  const prisma = new PrismaService();
  const orgUnitId = randomUUID();
  const userId = randomUUID();
  const sessionId = randomUUID();
  const closeJobId = randomUUID();
  let connected = false;
  let retryReadCount = 0;
  let releaseRetryReads!: () => void;
  const retryReadsReady = new Promise<void>((resolve) => {
    releaseRetryReads = resolve;
  });

  try {
    await prisma.$connect();
    connected = true;
    await prisma.orgUnit.create({
      data: { id: orgUnitId, name: `CI manual close retry ${orgUnitId}`, type: 'direkcija' },
    });
    await prisma.user.create({
      data: {
        id: userId,
        username: `ci-manual-close-retry-${userId}`,
        passwordHash: 'test-only',
        role: 'admin',
      },
    });
    await prisma.inventorySession.create({
      data: {
        id: sessionId,
        name: `CI manual close retry ${sessionId}`,
        orgUnitId,
        year: 2100,
        status: 'closing',
      },
    });
    await prisma.inventorySessionCloseJob.create({
      data: {
        id: closeJobId,
        sessionId,
        status: 'failed',
        failedCount: 1,
        lastError: 'previous close attempt failed',
        endedAt: new Date(),
      },
    });

    const prismaFacade = {
      $transaction: async (
        callback: (tx: Record<string, unknown>) => Promise<unknown>,
      ) => prisma.$transaction(async (tx) => {
        const txFacade = {
          inventorySession: tx.inventorySession,
          inventorySessionCloseJob: {
            findUnique: async (args: Parameters<typeof tx.inventorySessionCloseJob.findUnique>[0]) => {
              const job = await tx.inventorySessionCloseJob.findUnique(args);
              retryReadCount += 1;
              if (retryReadCount === 2) {
                releaseRetryReads();
              }
              await retryReadsReady;
              return job;
            },
            updateMany: tx.inventorySessionCloseJob.updateMany.bind(tx.inventorySessionCloseJob),
            findUniqueOrThrow: tx.inventorySessionCloseJob.findUniqueOrThrow.bind(
              tx.inventorySessionCloseJob,
            ),
          },
          inventorySessionCloseRetryAudit: tx.inventorySessionCloseRetryAudit,
        };
        return callback(txFacade);
      }),
    };

    let enqueueCount = 0;
    const queue = {
      add: async () => {
        enqueueCount += 1;
        return {};
      },
    };
    const service = new InventoryCountService(
      prismaFacade as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { assertFeatureEnabled: async () => undefined } as never,
      {} as never,
      queue as never,
    );
    const admin = { id: userId, role: 'admin' } as never;
    const attempts = await Promise.allSettled([
      service.retryFailedCloseSession(admin, sessionId, 'Database recovered after outage'),
      service.retryFailedCloseSession(admin, sessionId, 'Retry after database outage'),
    ]);

    const successfulRetries = attempts.filter((result) => result.status === 'fulfilled');
    const rejectedRetries = attempts.filter((result) => result.status === 'rejected');
    assert.equal(retryReadCount, 2, 'both admins must read the failed state before either update proceeds');
    assert.equal(successfulRetries.length, 1, 'exactly one concurrent retry should claim the failed job');
    assert.equal(rejectedRetries.length, 1, 'the losing retry should receive a conflict');
    assert.ok(
      rejectedRetries[0]?.status === 'rejected' &&
        rejectedRetries[0].reason instanceof ConflictException,
      'the losing retry must receive a controlled conflict response',
    );
    assert.equal(enqueueCount, 1, 'only the transaction winner may enqueue the close job');

    const [session, closeJob, audits] = await Promise.all([
      prisma.inventorySession.findUniqueOrThrow({ where: { id: sessionId } }),
      prisma.inventorySessionCloseJob.findUniqueOrThrow({ where: { id: closeJobId } }),
      prisma.inventorySessionCloseRetryAudit.findMany({ where: { closeJobId } }),
    ]);
    assert.equal(session.status, 'closing', 'manual retry must not reopen or close the session');
    assert.equal(closeJob.status, 'queued');
    assert.equal(closeJob.startedAt, null);
    assert.equal(closeJob.endedAt, null);
    assert.equal(closeJob.leaseToken, null);
    assert.equal(closeJob.leaseUntil, null);
    assert.equal(closeJob.lastError, null);
    assert.equal(audits.length, 1, 'only the winning retry should create an audit row');
    assert.equal(audits[0]?.actorUserId, userId);
    assert.ok(
      ['Database recovered after outage', 'Retry after database outage'].includes(audits[0]?.reason ?? ''),
      'the audit row must preserve the normalized reason supplied by the winning admin',
    );

    console.log('Verified concurrent admin close retries: one DB claim, one queue enqueue, and one reasoned audit row.');
  } finally {
    try {
      if (connected) {
        await prisma.inventorySession.deleteMany({ where: { id: sessionId } });
        await prisma.inventorySessionCloseRetryAudit.deleteMany({ where: { closeJobId } });
        await prisma.inventorySessionCloseJob.deleteMany({ where: { id: closeJobId } });
        await prisma.user.deleteMany({ where: { id: userId } });
        await prisma.orgUnit.deleteMany({ where: { id: orgUnitId } });
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
