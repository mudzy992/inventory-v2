import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentJobsService } from './document-jobs.service';

interface HarnessOptions {
  notificationsEnabled?: boolean;
  settingsThrows?: boolean;
  updateCount?: number;
  requestedByUserId?: string | null;
  recipient?: { id: string; isActive: boolean } | null;
}

interface Harness {
  service: DocumentJobsService;
  writes: { model: string; args: unknown }[];
  getTransactionCalls: () => number;
}

const createHarness = (options: HarnessOptions = {}): Harness => {
  const writes: { model: string; args: unknown }[] = [];
  let transactionCalls = 0;
  const job = {
    id: 'job-1',
    requestedByUserId:
      options.requestedByUserId === undefined ? 'user-1' : options.requestedByUserId,
    status: 'running',
  };
  const tx = {
    documentJob: {
      updateMany: async (args: unknown) => {
        writes.push({ model: 'documentJob.updateMany', args });
        return { count: options.updateCount ?? 1 };
      },
      findUnique: async () => job,
    },
    user: {
      findUnique: async () =>
        options.recipient === undefined ? { id: 'user-1', isActive: true } : options.recipient,
    },
    notificationOutbox: {
      createMany: async (args: unknown) => {
        writes.push({ model: 'notificationOutbox.createMany', args });
        return { count: 1 };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
      transactionCalls += 1;
      return callback(tx);
    },
  };
  const settings = {
    getBooleanValue: async (_key: string, defaultValue: boolean) => {
      if (options.settingsThrows) throw new Error('settings unavailable');
      return options.notificationsEnabled ?? defaultValue;
    },
  };
  return {
    service: new DocumentJobsService(prisma as never, settings as never),
    writes,
    getTransactionCalls: () => transactionCalls,
  };
};

const outboxWrites = (harness: Harness): unknown[] =>
  harness.writes.filter((write) => write.model === 'notificationOutbox.createMany');

test('completed document job persists an idempotent terminal outbox row in the status transaction', async () => {
  const harness = createHarness();
  const result = await harness.service.markDone('job-1');

  assert.equal(result?.id, 'job-1');
  assert.equal(harness.getTransactionCalls(), 1);
  const writes = outboxWrites(harness);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], {
    model: 'notificationOutbox.createMany',
    args: {
      data: [
        {
          idempotencyKey: 'document-job-terminal:job-1:done',
          userId: 'user-1',
          type: 'info',
          title: 'Generisanje dokumenta završeno',
          message: 'Generisani dokument je spreman za preuzimanje.',
          relatedId: 'job-1',
        },
      ],
      skipDuplicates: true,
    },
  });
});

test('failed document job persists the sanitized reason and attempt count', async () => {
  const harness = createHarness();
  const result = await harness.service.markFailed('job-1', 'Konverzija nije uspjela.', 2);

  assert.equal(result?.id, 'job-1');
  const update = harness.writes.find((write) => write.model === 'documentJob.updateMany') as
    | {
        args: {
          where: unknown;
          data: { status: string; endedAt: unknown; lastError: string; attempts: number };
        };
      }
    | undefined;
  assert.deepEqual(update?.args.where, {
    id: 'job-1',
    status: { in: ['queued', 'running'] },
  });
  assert.equal(update?.args.data.status, 'failed');
  assert.ok(update?.args.data.endedAt instanceof Date);
  assert.equal(update?.args.data.lastError, 'Konverzija nije uspjela.');
  assert.equal(update?.args.data.attempts, 2);
  const outbox = outboxWrites(harness)[0] as { args: { data: { message: string }[] } };
  assert.equal(outbox.args.data[0]?.message, 'Generisanje dokumenta nije uspjelo. Konverzija nije uspjela.');
});

test('disabled notification setting suppresses durable document notifications', async () => {
  const harness = createHarness({ notificationsEnabled: false });
  await harness.service.markDone('job-1');
  assert.equal(outboxWrites(harness).length, 0);
});

test('settings outage preserves durable document notifications', async () => {
  const harness = createHarness({ settingsThrows: true });
  await harness.service.markDone('job-1');
  assert.equal(outboxWrites(harness).length, 1);
});

test('callers can explicitly suppress terminal outbox persistence', async () => {
  const harness = createHarness();
  await harness.service.markDone('job-1', false);
  assert.equal(outboxWrites(harness).length, 0);
});

test('terminal compare-and-set miss and absent recipients never create outbox rows', async () => {
  const lostRace = createHarness({ updateCount: 0 });
  assert.equal(await lostRace.service.markDone('job-1'), null);
  assert.equal(outboxWrites(lostRace).length, 0);

  const anonymous = createHarness({ requestedByUserId: null });
  await anonymous.service.markDone('job-1');
  assert.equal(outboxWrites(anonymous).length, 0);

  const inactive = createHarness({ recipient: { id: 'user-1', isActive: false } });
  await inactive.service.markDone('job-1');
  assert.equal(outboxWrites(inactive).length, 0);
});
