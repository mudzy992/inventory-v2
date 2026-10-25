import { InventorySessionCloseWorkerService } from './inventory-session-close-worker.service';

export interface WorkerTestWrite {
  model: string;
  args: Record<string, unknown>;
}

export const createInventoryCloseWorkerTestHarness = (
  applyPendingAction: () => Promise<void>,
  closeNotificationRows: unknown[] = [],
) => {
  const writes: WorkerTestWrite[] = [];
  let pendingActionLookupCount = 0;
  const prisma: Record<string, unknown> = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    inventorySessionCloseJob: {
      findUnique: async () => ({ id: 'close-job-1', sessionId: 'session-1' }),
      findUniqueOrThrow: async () => ({
        id: 'close-job-1',
        sessionId: 'session-1',
        status: 'running',
        totalCount: 1,
        appliedCount: 1,
        failedCount: 0,
        skippedCount: 0,
      }),
      findFirst: async () => ({ id: 'close-job-1' }),
      updateMany: async (args: Record<string, unknown>) => {
        writes.push({ model: 'closeJob', args });
        return { count: 1 };
      },
    },
    inventoryPendingAction: {
      findFirst: async () => {
        pendingActionLookupCount += 1;
        return pendingActionLookupCount === 1 ? { id: 'action-1' } : null;
      },
      updateMany: async (args: Record<string, unknown>) => {
        writes.push({ model: 'pendingAction', args });
        return { count: 1 };
      },
    },
    inventorySession: {
      update: async (args: Record<string, unknown>) => {
        writes.push({ model: 'session', args });
        return {};
      },
    },
    notificationOutbox: {
      createMany: async (args: Record<string, unknown>) => {
        writes.push({ model: 'notificationOutbox', args });
        return { count: closeNotificationRows.length };
      },
    },
  };

  const worker = new InventorySessionCloseWorkerService(
    prisma as never,
    { applyPendingAction } as never,
    {
      emitInventoryCloseJobProgress: async () => undefined,
      buildInventorySessionClosedOutboxRows: async () => closeNotificationRows,
    } as never,
  );

  return { worker, writes, getPendingActionLookupCount: () => pendingActionLookupCount };
};
