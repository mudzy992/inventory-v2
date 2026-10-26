import assert from 'node:assert/strict';
import test from 'node:test';
import { InventorySessionCloseReconcilerService } from './inventory-session-close-reconciler.service';
import { buildInventoryCloseRecoveryJobId } from './utils/inventory-close-recovery.util';
import { runWithCorrelationId } from '../../common/utils/correlation-id.util';

test('reconciles queued jobs and running jobs with expired or missing leases', async () => {
  const updatedAt = new Date('2026-10-25T20:00:00.000Z');
  let query: Record<string, unknown> | undefined;
  let enqueue: { name: string; data: unknown; options: { jobId: string } } | undefined;
  const prisma = {
    inventorySessionCloseJob: {
      findMany: async (args: Record<string, unknown>) => {
        query = args;
        return [{ id: 'close-job-1', sessionId: 'session-1', updatedAt }];
      },
    },
  };
  const queue = {
    add: async (name: string, data: unknown, options: { jobId: string }) => {
      enqueue = { name, data, options };
    },
  };
  const reconciler = new InventorySessionCloseReconcilerService(prisma as never, queue as never);

  await runWithCorrelationId('cid-reconciler', () => reconciler.reconcileQueuedJobs());

  const where = query?.where as {
    OR: Array<Record<string, unknown>>;
  };
  assert.equal(where.OR[0]?.status, 'queued');
  const runningWhere = where.OR[1] as {
    status: string;
    OR: Array<{ leaseUntil: { lte?: Date } | null }>;
  };
  assert.equal(runningWhere.status, 'running');
  assert.ok(runningWhere.OR[0]?.leaseUntil?.lte instanceof Date);
  assert.deepEqual(runningWhere.OR[1], { leaseUntil: null });
  assert.deepEqual(enqueue, {
    name: 'close-session',
    data: { sessionId: 'session-1', correlationId: 'cid-reconciler' },
    options: { jobId: buildInventoryCloseRecoveryJobId('close-job-1', updatedAt) },
  });
});
