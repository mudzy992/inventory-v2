import assert from 'node:assert/strict';
import test from 'node:test';
import { createInventoryCloseWorkerTestHarness } from './inventory-session-close-worker.test-harness';

test('persists session-closed notification outbox rows in the close finalization transaction', async () => {
  const outboxRows = [
    {
      idempotencyKey: 'inventory-session-closed:session-1:admin-1',
      userId: 'admin-1',
      type: 'inventory_session_closed',
      title: 'Sesija popisa zatvorena',
      message: 'Sesija je zatvorena.',
      relatedId: 'session-1',
      sessionId: 'session-1',
    },
  ];
  const harness = createInventoryCloseWorkerTestHarness(async () => undefined, outboxRows);

  await harness.worker.process({
    data: { sessionId: 'session-1' },
    attemptsMade: 0,
    opts: { attempts: 3 },
  } as never);

  const write = harness.writes.find((item) => item.model === 'notificationOutbox');
  assert.deepEqual(write?.args, { data: outboxRows, skipDuplicates: true });
  const finalCloseJobUpdate = harness.writes
    .filter((item) => item.model === 'closeJob')
    .at(-1)?.args.data as { status?: string } | undefined;
  assert.equal(finalCloseJobUpdate?.status, 'done');
});

test('preserves best-effort partial close and records terminal pending-action failure', async () => {
  const harness = createInventoryCloseWorkerTestHarness(async () => {
    throw new Error('business validation failure');
  });

  await harness.worker.process({
    data: { sessionId: 'session-1' },
    attemptsMade: 0,
    opts: { attempts: 3 },
  } as never);

  assert.equal(harness.getPendingActionLookupCount(), 2, 'the failed action is not selected again');
  const actionUpdates = harness.writes.filter((write) => write.model === 'pendingAction');
  const finalActionUpdate = actionUpdates.at(-1)?.args.data as
    | { status: string; lastError: string; leaseToken: null }
    | undefined;
  assert.equal(finalActionUpdate?.status, 'failed');
  assert.equal(finalActionUpdate?.lastError, 'business validation failure');
  assert.equal(finalActionUpdate?.leaseToken, null);

  const sessionUpdate = harness.writes.find((write) => write.model === 'session')?.args.data as
    | { status: string; closedAt: Date }
    | undefined;
  assert.equal(sessionUpdate?.status, 'closed');
  assert.ok(sessionUpdate?.closedAt instanceof Date);

  const finalCloseJobUpdate = harness.writes
    .filter((write) => write.model === 'closeJob')
    .at(-1)?.args.data as { status?: string } | undefined;
  assert.equal(finalCloseJobUpdate?.status, 'done');
});
