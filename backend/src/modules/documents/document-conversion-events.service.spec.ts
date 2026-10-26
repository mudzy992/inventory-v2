import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentConversionEventsService } from './document-conversion-events.service';

interface EventHandlers {
  handleActive(jobId: string): Promise<void>;
  handleCompleted(jobId: string): Promise<void>;
  handleFailed(jobId: string, failedReason: string): Promise<void>;
}

interface EventTestHarness {
  handlers: EventHandlers;
  emissions: unknown[][];
  transferUpdates: unknown[];
  calls: {
    markRunning: number;
    markDone: number;
    markFailed: number;
  };
}

const createCompletedJobHarness = (): EventTestHarness => {
  const emissions: unknown[][] = [];
  const transferUpdates: unknown[] = [];
  const calls = { markRunning: 0, markDone: 0, markFailed: 0 };
  let terminal = false;
  const documentJob = {
    id: 'job-1',
    sourceType: 'transfer',
    sourceId: 'transfer-1',
    resultRelativePath: 'generated/transfer-1.pdf',
    requestedByUserId: 'user-1',
    status: 'running',
    lastError: null,
  };
  const service = new DocumentConversionEventsService(
    {
      getJob: async () => ({ attemptsMade: 2, opts: { attempts: 2 } }),
    } as never,
    {
      markRunning: async () => {
        calls.markRunning += 1;
        return !terminal;
      },
      markDone: async () => {
        calls.markDone += 1;
        if (terminal) return null;
        terminal = true;
        return documentJob;
      },
      markFailed: async () => {
        calls.markFailed += 1;
        return null;
      },
      incrementAttempts: async () => undefined,
      findById: async () => documentJob,
      findActiveJobs: async () => [],
    } as never,
    {
      emitDocumentJobUpdated: (...args: unknown[]) => emissions.push(args),
    } as never,
    {
      transfer: {
        update: async (args: unknown) => {
          transferUpdates.push(args);
          return { id: 'transfer-1' };
        },
      },
    } as never,
  );

  return {
    handlers: service as unknown as EventHandlers,
    emissions,
    transferUpdates,
    calls,
  };
};

test('late document queue events cannot duplicate completion side effects', async () => {
  const { handlers, emissions, transferUpdates, calls } = createCompletedJobHarness();

  await handlers.handleActive('job-1');
  await handlers.handleCompleted('job-1');
  await handlers.handleActive('job-1');
  await handlers.handleCompleted('job-1');
  await handlers.handleFailed('job-1', 'Late BullMQ failure');

  assert.equal(calls.markRunning, 2);
  assert.equal(calls.markDone, 2);
  assert.equal(calls.markFailed, 1);
  assert.equal(transferUpdates.length, 1, 'the transfer PDF path is synchronized once');
  assert.deepEqual(transferUpdates[0], {
    where: { id: 'transfer-1' },
    data: { generatedPdfPath: 'generated/transfer-1.pdf' },
  });
  assert.equal(emissions.length, 2, 'only the active and first completion transitions are emitted');
  assert.deepEqual(emissions[1]?.[1], {
    jobId: 'job-1',
    sourceType: 'transfer',
    sourceId: 'transfer-1',
    status: 'done',
    error: null,
  });
});

test('late active and completion events cannot duplicate a terminal failure notification', async () => {
  const emissions: unknown[][] = [];
  const calls = { markRunning: 0, markDone: 0, markFailed: 0 };
  let terminal = false;
  const documentJob = {
    id: 'job-2',
    sourceType: 'transfer',
    sourceId: 'transfer-2',
    requestedByUserId: 'user-2',
    status: 'failed',
    lastError: 'Konverzija nije uspjela.',
  };
  const service = new DocumentConversionEventsService(
    {
      getJob: async () => ({ attemptsMade: 2, opts: { attempts: 2 } }),
    } as never,
    {
      markRunning: async () => {
        calls.markRunning += 1;
        return !terminal;
      },
      markDone: async () => {
        calls.markDone += 1;
        return null;
      },
      markFailed: async () => {
        calls.markFailed += 1;
        if (terminal) return null;
        terminal = true;
        return documentJob;
      },
      incrementAttempts: async () => undefined,
      findById: async () => documentJob,
      findActiveJobs: async () => [],
    } as never,
    {
      emitDocumentJobUpdated: (...args: unknown[]) => emissions.push(args),
    } as never,
    {} as never,
  );
  const handlers = service as unknown as EventHandlers;

  await handlers.handleFailed('job-2', 'Konverzija nije uspjela.');
  await handlers.handleActive('job-2');
  await handlers.handleCompleted('job-2');
  await handlers.handleFailed('job-2', 'Duplicate BullMQ failure');

  assert.deepEqual(calls, { markRunning: 1, markDone: 1, markFailed: 2 });
  assert.equal(emissions.length, 1, 'the terminal failure is emitted once');
  assert.deepEqual(emissions[0]?.[1], {
    jobId: 'job-2',
    sourceType: 'transfer',
    sourceId: 'transfer-2',
    status: 'failed',
    error: 'Konverzija nije uspjela.',
  });
});
