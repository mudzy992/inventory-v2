import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryCountService } from './inventory-count.service';

const createService = () => {
  const job = { id: 'close-job-1', sessionId: 'session-1', status: 'queued' };
  const writes: string[] = [];
  const tx = {
    inventorySession: {
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
  assert.equal(result, job);
  assert.deepEqual(writes, ['session:closing', 'committees:closed', 'job:queued']);
  assert.equal(getEnqueueAttempts(), 1);
});
