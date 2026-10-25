import assert from 'node:assert/strict';
import test from 'node:test';
import { createInventoryCloseWorkerTestHarness } from './inventory-session-close-worker.test-harness';

const closeJob = {
  data: { sessionId: 'session-1' },
  attemptsMade: 0,
  opts: { attempts: 3 },
} as never;

test('retries known transient action errors then marks the action applied', async () => {
  let applicationAttempts = 0;
  const harness = createInventoryCloseWorkerTestHarness(async () => {
    applicationAttempts += 1;
    if (applicationAttempts < 3) {
      throw Object.assign(new Error('database serialization conflict'), { code: 'P2034' });
    }
  });

  await harness.worker.process(closeJob);

  assert.equal(applicationAttempts, 3);
  const actionUpdate = harness.writes
    .filter((write) => write.model === 'pendingAction')
    .at(-1)?.args.data as
    | { status: string; attempts: { increment: number }; appliedAt: Date; leaseToken: null }
    | undefined;
  assert.equal(actionUpdate?.status, 'applied');
  assert.equal(actionUpdate?.attempts.increment, 2);
  assert.ok(actionUpdate?.appliedAt instanceof Date);
  assert.equal(actionUpdate?.leaseToken, null);
  assert.equal(
    harness.writes.some(
      (write) => write.model === 'closeJob' &&
        (write.args.data as { failedCount?: unknown }).failedCount !== undefined,
    ),
    false,
  );
});

test('after the transient retry budget is exhausted, records failure and still closes with errors', async () => {
  let applicationAttempts = 0;
  const harness = createInventoryCloseWorkerTestHarness(async () => {
    applicationAttempts += 1;
    throw Object.assign(new Error('database serialization conflict'), { code: '40001' });
  });

  await harness.worker.process(closeJob);

  assert.equal(applicationAttempts, 3);
  const actionUpdate = harness.writes
    .filter((write) => write.model === 'pendingAction')
    .at(-1)?.args.data as
    | { status: string; attempts: { increment: number }; lastError: string }
    | undefined;
  assert.equal(actionUpdate?.status, 'failed');
  assert.equal(actionUpdate?.attempts.increment, 2);
  assert.equal(actionUpdate?.lastError, 'database serialization conflict');
  assert.ok(
    harness.writes.some(
      (write) => write.model === 'closeJob' &&
        (write.args.data as { failedCount?: { increment: number } }).failedCount?.increment === 1,
    ),
  );
  assert.ok(
    harness.writes.some(
      (write) => write.model === 'session' &&
        (write.args.data as { status?: string }).status === 'closed',
    ),
  );
});
