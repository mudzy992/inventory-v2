import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { InventorySessionCloseWorkerService } from '../src/modules/inventory-count/inventory-session-close-worker.service';
import { PrismaService } from '../src/prisma/prisma.service';

const main = async (): Promise<void> => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ''));
  if (
    process.env.NODE_ENV !== 'test' ||
    !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
    databaseName !== 'inventory_ci'
  ) {
    throw new Error('Pending-action outcome integration check is restricted to the local inventory_ci test database');
  }

  const prisma = new PrismaService();
  const orgUnitId = randomUUID();
  const userId = randomUUID();
  const categoryId = randomUUID();
  const equipmentIds = [randomUUID(), randomUUID()];
  const sessionId = randomUUID();
  const committeeId = randomUUID();
  const lineIds = [randomUUID(), randomUUID()];
  const actionIds = [randomUUID(), randomUUID()];
  const closeJobId = randomUUID();
  let connected = false;

  try {
    await prisma.$connect();
    connected = true;
    await prisma.orgUnit.create({
      data: { id: orgUnitId, name: `CI pending outcome unit ${orgUnitId}`, type: 'direkcija' },
    });
    await prisma.user.create({
      data: {
        id: userId,
        username: `ci-pending-outcome-${userId}`,
        passwordHash: 'test-only',
        role: 'admin',
      },
    });
    await prisma.category.create({
      data: {
        id: categoryId,
        name: `CI pending outcome category ${categoryId}`,
        description: 'CI pending action outcome test',
        fields: [],
      },
    });
    for (const id of equipmentIds) {
      await prisma.equipment.create({
        data: {
          id,
          categoryId,
          specifications: {},
          status: 'skladiste',
          inventoryNumber: `CI-${id}`,
          entryDate: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
    }
    await prisma.inventorySession.create({
      data: {
        id: sessionId,
        name: `CI pending outcome session ${sessionId}`,
        orgUnitId,
        year: 2100,
        status: 'closing',
      },
    });
    await prisma.inventoryCommittee.create({
      data: { id: committeeId, sessionId, categoryId },
    });
    for (let index = 0; index < lineIds.length; index += 1) {
      await prisma.inventoryLine.create({
        data: {
          id: lineIds[index]!,
          committeeId,
          equipmentId: equipmentIds[index]!,
          status: 'prisutna',
        },
      });
    }
    const actionCreatedAt = [
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-01T00:00:01.000Z'),
    ];
    for (let index = 0; index < actionIds.length; index += 1) {
      await prisma.inventoryPendingAction.create({
        data: {
          id: actionIds[index]!,
          sessionId,
          committeeId,
          equipmentId: equipmentIds[index]!,
          inventoryLineId: lineIds[index]!,
          kind: 'mark_present',
          payload: {},
          status: 'pending',
          createdByUserId: userId,
          createdAt: actionCreatedAt[index],
        },
      });
    }
    await prisma.inventorySessionCloseJob.create({
      data: { id: closeJobId, sessionId, status: 'queued', totalCount: 2 },
    });

    let transientAttempts = 0;
    const inventoryCountService = {
      applyPendingAction: async (actionId: string) => {
        if (actionId === actionIds[0]) {
          transientAttempts += 1;
          if (transientAttempts < 3) {
            throw Object.assign(new Error('serialization conflict'), { code: 'P2034' });
          }
          return;
        }
        throw new Error('permanent validation failure');
      },
    };
    const worker = new InventorySessionCloseWorkerService(
      prisma,
      inventoryCountService as never,
      {
        emitInventoryCloseJobProgress: async () => undefined,
        buildInventorySessionClosedOutboxRows: async () => [],
      } as never,
    );
    await worker.process({
      id: 'ci-pending-action-outcomes',
      data: { sessionId },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as never);

    const [closeJob, session, actions] = await Promise.all([
      prisma.inventorySessionCloseJob.findUniqueOrThrow({ where: { id: closeJobId } }),
      prisma.inventorySession.findUniqueOrThrow({ where: { id: sessionId } }),
      prisma.inventoryPendingAction.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    assert.equal(transientAttempts, 3, 'known transient failure gets exactly three total attempts');
    assert.equal(actions[0]?.status, 'applied');
    assert.equal(actions[0]?.attempts, 3);
    assert.equal(actions[0]?.lastError, null);
    assert.equal(actions[1]?.status, 'failed', 'permanent error is recorded without retry');
    assert.equal(actions[1]?.attempts, 1);
    assert.equal(actions[1]?.lastError, 'permanent validation failure');
    assert.equal(closeJob.status, 'done', 'the session close completes despite a failed pending action');
    assert.equal(closeJob.appliedCount, 1);
    assert.equal(closeJob.failedCount, 1);
    assert.equal(session.status, 'closed');

    console.log(
      'Verified PostgreSQL close semantics: transient action retries stop after success; permanent action is recorded as failed and session closes with failedCount.',
    );
  } finally {
    try {
      if (connected) {
        await prisma.inventorySession.deleteMany({ where: { id: sessionId } });
        await prisma.equipment.deleteMany({ where: { id: { in: equipmentIds } } });
        await prisma.category.deleteMany({ where: { id: categoryId } });
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
