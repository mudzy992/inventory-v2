import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { PrismaService } from '../src/prisma/prisma.service';
import { InventorySessionCloseReconcilerService } from '../src/modules/inventory-count/inventory-session-close-reconciler.service';
import {
  INVENTORY_SESSION_CLOSE_QUEUE,
} from '../src/modules/inventory-count/inventory-session-close.queue';
import { buildInventoryCloseRecoveryJobId } from '../src/modules/inventory-count/utils/inventory-close-recovery.util';

const main = async (): Promise<void> => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ''));
  const redisHost = process.env.REDIS_HOST ?? '127.0.0.1';
  const redisPort = Number(process.env.REDIS_PORT ?? 6379);
  if (
    process.env.NODE_ENV !== 'test' ||
    !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
    databaseName !== 'inventory_ci' ||
    !['localhost', '127.0.0.1'].includes(redisHost) ||
    !Number.isSafeInteger(redisPort) ||
    redisPort < 1 ||
    redisPort > 65535
  ) {
    throw new Error('Inventory close reconciler check is restricted to local CI PostgreSQL and Redis services');
  }

  const prisma = new PrismaService();
  const queue = new Queue(INVENTORY_SESSION_CLOSE_QUEUE, {
    connection: { host: redisHost, port: redisPort, maxRetriesPerRequest: null },
  });
  const orgUnitId = randomUUID();
  const sessionId = randomUUID();
  const closeJobId = randomUUID();
  let prismaConnected = false;
  let queueReady = false;
  let recoveryJobId: string | undefined;

  try {
    await prisma.$connect();
    prismaConnected = true;
    await queue.waitUntilReady();
    queueReady = true;

    await prisma.orgUnit.create({
      data: { id: orgUnitId, name: `CI close reconcile ${orgUnitId}`, type: 'direkcija' },
    });
    await prisma.inventorySession.create({
      data: {
        id: sessionId,
        name: `CI close reconcile ${sessionId}`,
        orgUnitId,
        year: 2100,
        status: 'closing',
      },
    });
    const closeJob = await prisma.inventorySessionCloseJob.create({
      data: { id: closeJobId, sessionId, status: 'queued' },
      select: { id: true, updatedAt: true },
    });
    const currentRecoveryJobId = buildInventoryCloseRecoveryJobId(closeJob.id, closeJob.updatedAt);
    recoveryJobId = currentRecoveryJobId;

    let queryCount = 0;
    let releaseBothQueries!: () => void;
    const bothQueriesComplete = new Promise<void>((resolve) => {
      releaseBothQueries = resolve;
    });
    const sharedPrismaFacade = {
      inventorySessionCloseJob: {
        findMany: async (args: Parameters<typeof prisma.inventorySessionCloseJob.findMany>[0]) => {
          queryCount += 1;
          if (queryCount === 2) {
            releaseBothQueries();
          }
          await bothQueriesComplete;
          return prisma.inventorySessionCloseJob.findMany(args);
        },
      },
    };
    const first = new InventorySessionCloseReconcilerService(
      sharedPrismaFacade as never,
      queue as never,
    );
    const second = new InventorySessionCloseReconcilerService(
      sharedPrismaFacade as never,
      queue as never,
    );

    await Promise.all([first.reconcileQueuedJobs(), second.reconcileQueuedJobs()]);

    assert.equal(queryCount, 2, 'both reconciler instances must observe the same queued DB row');
    const enqueued = await queue.getJob(currentRecoveryJobId);
    assert.ok(enqueued, 'deterministic recovery job must be present in BullMQ');
    assert.equal(enqueued.name, 'close-session');
    assert.deepEqual(enqueued.data, { sessionId });
    const jobsWithRecoveryId = (await queue.getJobs([
      'waiting',
      'active',
      'delayed',
      'completed',
      'failed',
    ])).filter((job) => job.id === currentRecoveryJobId);
    assert.equal(jobsWithRecoveryId.length, 1, 'concurrent reconciler enqueue must be deduplicated');

    console.log('Verified concurrent PostgreSQL reconcilers enqueue one deterministic BullMQ recovery job.');
  } finally {
    try {
      if (queueReady && recoveryJobId) {
        await queue.remove(recoveryJobId).catch(() => undefined);
      }
      if (prismaConnected) {
        await prisma.inventorySession.deleteMany({ where: { id: sessionId } });
        await prisma.orgUnit.deleteMany({ where: { id: orgUnitId } });
      }
    } finally {
      await Promise.all([queue.close(), prisma.$disconnect()]);
    }
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
