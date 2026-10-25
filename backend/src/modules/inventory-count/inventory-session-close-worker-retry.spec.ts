import assert from 'node:assert/strict';
import test from 'node:test';
import { InventorySessionCloseWorkerService } from './inventory-session-close-worker.service';

const createWorkerScenario = (applyPendingAction: () => Promise<void>) => {
  const writes: Array<{ model: string; args: Record<string, unknown> }> = [];
  let pendingActionLookupCount = 0;
  const prisma = {
    inventorySessionCloseJob: {
      findUnique: async () => ({ id: 'close-job-1', sessionId: 'session-1' }),
      updateMany: async () => ({ count: 1 }),
      update: async (args: Record<string, unknown>) => {
        writes.push({ model: 'closeJob', args });
        const data = args.data as {
          appliedCount?: { increment: number };
          failedCount?: { increment: number };
          status?: string;
        };
        return {
          status: data.status ?? 'running',
          totalCount: 1,
          appliedCount: data.appliedCount?.increment ?? 1,
          failedCount: data.failedCount?.increment ?? 0,
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
  const worker = new InventorySessionCloseWorkerService(
    prisma as never,
    { applyPendingAction } as never,
    { emitInventoryCloseJobProgress: async () => undefined } as never,
  );

  return { worker, writes };
};

const closeJob = {
  data: { sessionId: 'session-1' },
  attemptsMade: 0,
  opts: { attempts: 3 },
} as never;

test('retries known transient action errors then marks the action applied', async () => {
  let applicationAttempts = 0;
  const { worker, writes } = createWorkerScenario(async () => {
    applicationAttempts += 1;
    if (applicationAttempts < 3) {
      throw Object.assign(new Error('database serialization conflict'), { code: 'P2034' });
    }
  });

  await worker.process(closeJob);

  assert.equal(applicationAttempts, 3);
  const actionUpdate = writes.find((write) => write.model === 'pendingAction')?.args.data as
    | { status: string; attempts: { increment: number }; appliedAt: Date }
    | undefined;
  assert.equal(actionUpdate?.status, 'applied');
  assert.equal(actionUpdate?.attempts.increment, 2);
  assert.ok(actionUpdate?.appliedAt instanceof Date);
  assert.equal(
    writes.some(
      (write) => write.model === 'closeJob' &&
        (write.args.data as { failedCount?: unknown }).failedCount !== undefined,
    ),
    false,
  );
});

test('after the transient retry budget is exhausted, records failure and still closes with errors', async () => {
  let applicationAttempts = 0;
  const { worker, writes } = createWorkerScenario(async () => {
    applicationAttempts += 1;
    throw Object.assign(new Error('database serialization conflict'), { code: '40001' });
  });

  await worker.process(closeJob);

  assert.equal(applicationAttempts, 3);
  const actionUpdate = writes.find((write) => write.model === 'pendingAction')?.args.data as
    | { status: string; attempts: { increment: number }; lastError: string }
    | undefined;
  assert.equal(actionUpdate?.status, 'failed');
  assert.equal(actionUpdate?.attempts.increment, 2);
  assert.equal(actionUpdate?.lastError, 'database serialization conflict');
  assert.ok(
    writes.some(
      (write) => write.model === 'closeJob' &&
        (write.args.data as { failedCount?: { increment: number } }).failedCount?.increment === 1,
    ),
  );
  assert.ok(
    writes.some(
      (write) => write.model === 'session' &&
        (write.args.data as { status?: string }).status === 'closed',
    ),
  );
});
