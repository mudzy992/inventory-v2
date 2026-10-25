import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { InventoryCountService } from './inventory-count.service';

const createService = () => {
  const job = {
    id: 'close-job-1',
    sessionId: 'session-1',
    status: 'queued',
    totalCount: 2,
    appliedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    startedAt: null,
    endedAt: null,
    leaseToken: 'internal-token',
    leaseUntil: new Date('2026-10-25T20:00:00.000Z'),
    lastError: null,
    createdAt: new Date('2026-10-25T19:00:00.000Z'),
    updatedAt: new Date('2026-10-25T19:00:00.000Z'),
  };
  const writes: string[] = [];
  const tx = {
    inventorySession: {
      findUnique: async () => ({ status: 'closed' }),
      updateMany: async (args: { data: { status: string } }) => {
        writes.push(`session:${args.data.status}`);
        return { count: 1 };
      },
    },
    inventoryLine: { findMany: async () => [] },
    inventoryCommittee: {
      updateMany: async () => {
        writes.push('committees:closed');
        return { count: 0 };
      },
    },
    inventoryPendingAction: { count: async () => 2 },
    inventorySessionCloseJob: {
      upsert: async () => {
        writes.push('job:queued');
        return job;
      },
    },
  };
  const prisma = {
    inventorySession: {
      findUnique: async () => ({ id: 'session-1', status: 'active', closeJobs: [] }),
    },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  };
  let enqueueAttempts = 0;
  const queue = {
    add: async () => {
      enqueueAttempts += 1;
      throw new Error('Redis unavailable');
    },
  };
  const service = new InventoryCountService(
    prisma as never,
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
  return { service, job, writes, getEnqueueAttempts: () => enqueueAttempts };
};

test('persists close state before enqueue and leaves a durable job when Redis is unavailable', async () => {
  const { service, job, writes, getEnqueueAttempts } = createService();
  const result = await service.closeSession({ id: 'admin-1' } as never, 'session-1');
  assert.deepEqual(result, {
    id: job.id,
    sessionId: job.sessionId,
    status: job.status,
    totalCount: job.totalCount,
    appliedCount: job.appliedCount,
    failedCount: job.failedCount,
    skippedCount: job.skippedCount,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    lastError: job.lastError,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
  assert.equal('leaseToken' in result, false);
  assert.equal('leaseUntil' in result, false);
  assert.deepEqual(writes, ['session:closing', 'committees:closed', 'job:queued']);
  assert.equal(getEnqueueAttempts(), 1);
});

test('manual retry is admin-only and cannot reopen a closed session', async () => {
  const { service } = createService();
  await assert.rejects(
    service.retryFailedCloseSession(
      { id: 'user-1', role: 'user' } as never,
      'session-1',
      'Retry after failure',
    ),
    ForbiddenException,
  );
  await assert.rejects(
    service.retryFailedCloseSession(
      { id: 'admin-1', role: 'admin' } as never,
      'session-1',
      'Retry after failure',
    ),
    BadRequestException,
  );
});

test('manual retry requeues a failed closing job and records the administrator reason', async () => {
  const writes: unknown[] = [];
  const queuedJob = {
    id: 'close-job-2',
    sessionId: 'session-2',
    status: 'queued',
    totalCount: 4,
    appliedCount: 2,
    failedCount: 0,
    skippedCount: 0,
    startedAt: null,
    endedAt: null,
    leaseToken: null,
    leaseUntil: null,
    lastError: null,
    createdAt: new Date('2026-10-25T19:00:00.000Z'),
    updatedAt: new Date('2026-10-25T19:30:00.000Z'),
  };
  const tx = {
    inventorySession: { findUnique: async () => ({ status: 'closing' }) },
    inventorySessionCloseJob: {
      findUnique: async () => ({ id: 'close-job-2', status: 'failed' }),
      updateMany: async (args: unknown) => {
        writes.push(['job-update', args]);
        return { count: 1 };
      },
      findUniqueOrThrow: async () => queuedJob,
    },
    inventorySessionCloseRetryAudit: {
      create: async (args: unknown) => {
        writes.push(['audit', args]);
        return args;
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  };
  let enqueueAttempts = 0;
  const queue = {
    add: async () => {
      enqueueAttempts += 1;
      throw new Error('Redis unavailable; reconciler will enqueue the persisted job');
    },
  };
  const service = new InventoryCountService(
    prisma as never,
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
  const result = await service.retryFailedCloseSession(
    { id: 'admin-2', role: 'admin' } as never,
    'session-2',
    ' Database recovered after outage ',
  );
  assert.equal(result.status, 'queued');
  assert.equal('leaseToken' in result, false);
  assert.equal(enqueueAttempts, 1);
  assert.deepEqual(writes[1], [
    'audit',
    {
      data: {
        closeJobId: 'close-job-2',
        actorUserId: 'admin-2',
        reason: 'Database recovered after outage',
      },
    },
  ]);
});
