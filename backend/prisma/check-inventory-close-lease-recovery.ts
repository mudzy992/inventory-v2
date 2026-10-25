import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { InventoryCountService } from '../src/modules/inventory-count/inventory-count.service';
import { InventorySessionCloseWorkerService } from '../src/modules/inventory-count/inventory-session-close-worker.service';
import { PrismaService } from '../src/prisma/prisma.service';

const assertTestDatabase = (): void => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ''));
  if (
    process.env.NODE_ENV !== 'test' ||
    !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
    databaseName !== 'inventory_ci'
  ) {
    throw new Error('Inventory close lease integration check is restricted to the local inventory_ci test database');
  }
};

const createInventoryCountService = (prisma: PrismaService): InventoryCountService =>
  new InventoryCountService(
    prisma,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      notificationsEnabled: async () => true,
      enqueueDisposalApprovalPendingOutboxInTx: async () => undefined,
      emitInventoryDisposalInboxRefresh: async () => undefined,
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

const killProcessAfterActionSideEffect = async (actionId: string): Promise<never> => {
  assertTestDatabase();
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    await createInventoryCountService(prisma).applyPendingAction(actionId);
    // Simulate SIGKILL after the approval transaction commits but before the
    // close worker can mark the pending action as applied.
    process.kill(process.pid, 'SIGKILL');
    throw new Error('Test worker process was expected to be killed after the side effect committed');
  } finally {
    await prisma.$disconnect();
  }
};

const main = async (): Promise<void> => {
  assertTestDatabase();

  const prisma = new PrismaService();
  const cantonId = randomUUID();
  const cityId = randomUUID();
  const orgUnitId = randomUUID();
  const userId = randomUUID();
  const categoryId = randomUUID();
  const commissionId = randomUUID();
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
    await prisma.canton.create({
      data: { id: cantonId, name: `CI lease canton ${cantonId}` },
    });
    await prisma.city.create({
      data: { id: cityId, name: `CI lease city ${cityId}`, cantonId },
    });
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
    await prisma.disposalCommission.create({
      data: { id: commissionId, cityId, name: `CI lease commission ${commissionId}` },
    });
    await prisma.equipment.create({
      data: {
        id: equipmentId,
        categoryId,
        specifications: {},
        status: 'skladiste',
        inventoryNumber: `CI-${equipmentId}`,
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
      data: { id: committeeId, sessionId, categoryId, disposalCommissionId: commissionId },
    });
    await prisma.inventoryLine.create({
      data: { id: lineId, committeeId, equipmentId, status: 'predlozen_rashod' },
    });

    const expiredAt = new Date(Date.now() - 60_000);
    await prisma.inventoryPendingAction.create({
      data: {
        id: actionId,
        sessionId,
        committeeId,
        equipmentId,
        inventoryLineId: lineId,
        kind: 'disposal',
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

    const killedWorker = spawnSync(
      process.execPath,
      ['--import', 'tsx', resolve(process.cwd(), 'prisma/check-inventory-close-lease-recovery.ts')],
      {
        env: {
          ...process.env,
          INVENTORY_CLOSE_CRASH_AFTER_ACTION_ID: actionId,
        },
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    assert.equal(killedWorker.signal, 'SIGKILL', 'the side-effect worker must be killed after commit');

    const approvalBeforeRecovery = await prisma.disposalInventoryApproval.findUniqueOrThrow({
      where: {
        equipmentId_disposalCommissionId: { equipmentId, disposalCommissionId: commissionId },
      },
    });
    assert.equal(approvalBeforeRecovery.status, 'pending');
    assert.equal(approvalBeforeRecovery.sessionId, sessionId);

    const worker = new InventorySessionCloseWorkerService(
      prisma,
      createInventoryCountService(prisma),
      {
        emitInventoryCloseJobProgress: async () => undefined,
        buildInventorySessionClosedOutboxRows: async () => [],
      } as never,
    );
    await worker.process({
      id: 'ci-expired-close-lease',
      data: { sessionId },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as never);

    const [closeJob, action, session, approvals] = await Promise.all([
      prisma.inventorySessionCloseJob.findUniqueOrThrow({ where: { id: closeJobId } }),
      prisma.inventoryPendingAction.findUniqueOrThrow({ where: { id: actionId } }),
      prisma.inventorySession.findUniqueOrThrow({ where: { id: sessionId } }),
      prisma.disposalInventoryApproval.findMany({ where: { equipmentId, disposalCommissionId: commissionId } }),
    ]);
    assert.equal(approvals.length, 1, 'replay must not duplicate the committed disposal approval');
    assert.equal(approvals[0]?.id, approvalBeforeRecovery.id);
    assert.equal(approvals[0]?.status, 'pending');
    assert.equal(action.status, 'applied');
    assert.equal(action.attempts, 2, 'the takeover must count as a new action attempt');
    assert.equal(action.leaseToken, null);
    assert.equal(closeJob.status, 'done');
    assert.equal(closeJob.leaseToken, null);
    assert.equal(closeJob.leaseUntil, null);
    assert.equal(session.status, 'closed');

    console.log(
      'Verified real process-kill recovery after a committed disposal side effect: replay preserves one approval and closes the session.',
    );
  } finally {
    try {
      if (connected) {
        await prisma.inventorySession.deleteMany({ where: { id: sessionId } });
        await prisma.disposalCommission.deleteMany({ where: { id: commissionId } });
        await prisma.equipment.deleteMany({ where: { id: equipmentId } });
        await prisma.category.deleteMany({ where: { id: categoryId } });
        await prisma.user.deleteMany({ where: { id: userId } });
        await prisma.orgUnit.deleteMany({ where: { id: orgUnitId } });
        await prisma.city.deleteMany({ where: { id: cityId } });
        await prisma.canton.deleteMany({ where: { id: cantonId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  }
};

const crashActionId = process.env.INVENTORY_CLOSE_CRASH_AFTER_ACTION_ID;
if (crashActionId) {
  void killProcessAfterActionSideEffect(crashActionId).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
