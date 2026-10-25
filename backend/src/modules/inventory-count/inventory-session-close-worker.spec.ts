import assert from 'node:assert/strict';
import test from 'node:test';
import { InventorySessionCloseWorkerService } from './inventory-session-close-worker.service';

test('preserves best-effort partial close and does not automatically retry a failed pending action', async () => {
  const writes: Array<{ model: string; args: Record<string, unknown> }> = [];
  let pendingActionLookupCount = 0;
  const prisma = {
    inventorySessionCloseJob: {
      findUnique: async () => ({ id: 'close-job-1', sessionId: 'session-1' }),
      updateMany: async () => ({ count: 1 }),
      update: async (args: Record<string, unknown>) => {
        writes.push({ model: 'closeJob', args });
        return {
          status: (args.data as { status?: string }).status ?? 'running',
          totalCount: 1,
          appliedCount: 0,
          failedCount: (args.data as { failedCount?: { increment: number } }).failedCount?.increment ?? 1,
          skippedCount: 0,
        };
      },
    },
    inventoryPendingAction: {
      findFirst: async () => {
        pendingActionLookupCount += 1;
        return pendingActionLookupCount === 1 ? { id: 'action-1' } : null;
      },
      updateMany: async () => ({ count: 1 }),
      update: async (args: Record<string, unknown>) => {
        writes.push({ model: 'pendingAction', args });
        return {};
      },
    },
    inventorySession: {
      update: async (args: Record<string, unknown>) => {
        writes.push({ model: 'session', args });
        return {};
      },
    },
  };
  const inventoryCountService = {
    applyPendingAction: async () => {
      throw new Error('transient dependency outage');
    },
  };
  const notificationsService = {
    emitInventoryCloseJobProgress: async () => undefined,
  };
  const worker = new InventorySessionCloseWorkerService(
    prisma as never,
    inventoryCountService as never,
    notificationsService as never,
  );

  await worker.process({
    data: { sessionId: 'session-1' },
    attemptsMade: 0,
    opts: { attempts: 3 },
  } as never);

  assert.equal(pendingActionLookupCount, 2, 'the failed action is not selected again');
  assert.deepEqual(
    writes.find((write) => write.model === 'pendingAction')?.args.data,
    { status: 'failed', lastError: 'transient dependency outage' },
  );
  const sessionUpdate = writes.find((write) => write.model === 'session')?.args.data as
    | { status: string; closedAt: Date }
    | undefined;
  assert.equal(sessionUpdate?.status, 'closed');
  assert.ok(sessionUpdate?.closedAt instanceof Date);

  const closeJobUpdates = writes.filter((write) => write.model === 'closeJob');
  const finalCloseJobUpdate = closeJobUpdates.at(-1)?.args.data as { status?: string } | undefined;
  assert.equal(finalCloseJobUpdate?.status, 'done');
});
