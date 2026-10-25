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
    throw new Error('Inventory close lease integration check is restricted to the local inventory_ci test database');
  }

  const prisma = new PrismaService();
  const orgUnitId = randomUUID();
  const userId = randomUUID();
  const categoryId = randomUUID();
  const equipmentId = randomUUID();
  const sessionId = randomUUID();
  const committeeId = randomUUID();
  const lineId = randomUUID();
  const actionId = randomUUID();
  const closeJobId = randomUUID();
  let connected = false;

  try {
    await prisma.$connect();
    connected = true;
    await prisma.orgUnit.create({
      data: { id: orgUnitId, name: `CI lease unit ${orgUnitId}`, type: 'direkcija' },
    });
    await prisma.user.create({
      data: {
        id: userId,
        username: `ci-lease-${userId}`,
        passwordHash: 'test-only',
        role: 'admin',
      },
    });
    await prisma.category.create({
      data: {
        id: categoryId,
        name: `CI lease category ${categoryId}`,
        description: 'CI close lease recovery test',
        fields: [],
      },
    });
    await prisma.equipment.create({
      data: {
        id: equipmentId,
        categoryId,
        specifications: {},
        status: 'skladiste',
        entryDate: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await prisma.inventorySession.create({
      data: {
        id: sessionId,
        name: `CI lease session ${sessionId}`,
        orgUnitId,
        year: 2100,
        status: 'closing',
      },
    });
    await prisma.inventoryCommittee.create({
      data: { id: committeeId, sessionId, categoryId },
    });
    await prisma.inventoryLine.create({
      data: { id: lineId, committeeId, equipmentId, status: 'prisutna' },
    });

    const expiredAt = new Date(Date.now() - 60_000);
    await prisma.inventoryPendingAction.create({
      data: {
        id: actionId,
        sessionId,
        committeeId,
        equipmentId,
        inventoryLineId: lineId,
        kind: 'mark_present',
        payload: {},
        status: 'running',
        attempts: 1,
        leaseToken: 'abandoned-worker-token',
        createdByUserId: userId,
      },
    });
    await prisma.inventorySessionCloseJob.create({
      data: {
        id: closeJobId,
        sessionId,
        status: 'running',
        totalCount: 1,
        startedAt: expiredAt,
        leaseToken: 'abandoned-worker-token',
        leaseUntil: expiredAt,
      },
    });

    let appliedActionCount = 0;
    const worker = new InventorySessionCloseWorkerService(
      prisma,
      {
        applyPendingAction: async () => {
          appliedActionCount += 1;
        },
      } as never,
      { emitInventoryCloseJobProgress: async () => undefined } as never,
    );

    await worker.process({
      id: 'ci-expired-close-lease',
      data: { sessionId },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as never);

    const [closeJob, action, session] = await Promise.all([
      prisma.inventorySessionCloseJob.findUniqueOrThrow({ where: { id: closeJobId } }),
      prisma.inventoryPendingAction.findUniqueOrThrow({ where: { id: actionId } }),
      prisma.inventorySession.findUniqueOrThrow({ where: { id: sessionId } }),
    ]);
    assert.equal(appliedActionCount, 1, 'the abandoned running action must be replayed exactly once');
    assert.equal(action.status, 'applied');
    assert.equal(action.attempts, 2, 'the takeover must count as a new action attempt');
    assert.equal(action.leaseToken, null);
    assert.equal(closeJob.status, 'done');
    assert.equal(closeJob.leaseToken, null);
    assert.equal(closeJob.leaseUntil, null);
    assert.equal(session.status, 'closed');

    console.log('Verified PostgreSQL recovery of an expired running close job and its abandoned pending action.');
  } finally {
    try {
      if (connected) {
        await prisma.inventorySession.deleteMany({ where: { id: sessionId } });
        await prisma.equipment.deleteMany({ where: { id: equipmentId } });
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
