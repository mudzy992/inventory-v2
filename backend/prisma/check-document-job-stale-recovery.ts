import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import {
  DOCUMENT_GENERATION_QUEUE,
  DOCUMENT_CONVERT_JOB_NAME,
} from '../src/modules/documents/document-generation.queue';
import { DOCUMENT_JOB_STALE_RECOVERY_ERROR } from '../src/modules/documents/document-job-recovery-policy.util';
import { documentJobTerminalOutboxKey } from '../src/modules/documents/document-job-terminal-outbox.util';
import { DocumentJobsService } from '../src/modules/documents/document-jobs.service';
import { DocumentConversionEventsService } from '../src/modules/documents/document-conversion-events.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Fault injection: a document-worker is SIGKILLed (or no worker exists) while
 * its BullMQ job is still waiting/active. Without a time bound the DocumentJob
 * DB row stays `queued`/`running` forever. This live CI check (real PostgreSQL
 * + real Redis/BullMQ) proves the bounded reconciler terminates such rows with
 * exactly one durable notification, leaves healthy in-flight work alone and
 * is idempotent across repeated reconciliations.
 */

const main = async (): Promise<void> => {
  const rawDatabaseUrl = process.env.DATABASE_URL ?? '';
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(rawDatabaseUrl);
  } catch {
    throw new Error('DATABASE_URL is required for the stale DocumentJob recovery check');
  }
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ''));
  const redisHost = process.env.REDIS_HOST ?? '127.0.0.1';
  const redisPort = Number(process.env.REDIS_PORT ?? '6379');
  if (
    process.env.NODE_ENV !== 'test' ||
    !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
    databaseName !== 'inventory_ci' ||
    !['localhost', '127.0.0.1'].includes(redisHost)
  ) {
    throw new Error('Stale DocumentJob recovery check is restricted to local CI PostgreSQL and Redis services');
  }

  const prisma = new PrismaService();
  const queue = new Queue(DOCUMENT_GENERATION_QUEUE, {
    connection: { host: redisHost, port: redisPort, maxRetriesPerRequest: null },
    prefix: 'inventory-v2',
  });
  const userId = randomUUID();
  const jobIds: string[] = [];
  const emissions: unknown[][] = [];
  let connected = false;
  let queueReady = false;

  const createJob = async (options: {
    status: 'queued' | 'running';
    ageMs: number;
    withBullJob: boolean;
  }): Promise<string> => {
    const id = randomUUID();
    const sourceId = randomUUID();
    const createdAt = new Date(Date.now() - options.ageMs);
    await prisma.documentJob.create({
      data: {
        id,
        sourceType: 'transfer',
        sourceId,
        sourceFormat: 'docx',
        targetFormat: 'pdf',
        sourceRelativePath: `ci/${sourceId}.docx`,
        resultRelativePath: `ci/${sourceId}.pdf`,
        status: options.status,
        requestedByUserId: userId,
        createdAt,
        ...(options.status === 'running' ? { startedAt: createdAt } : {}),
      },
    });
    jobIds.push(id);
    if (options.withBullJob) {
      await queue.add(
        DOCUMENT_CONVERT_JOB_NAME,
        {
          documentJobId: id,
          sourceFormat: 'docx',
          targetFormat: 'pdf' as const,
          sourceRelativePath: `ci/${sourceId}.docx`,
          resultRelativePath: `ci/${sourceId}.pdf`,
        },
        { jobId: id },
      );
    }
    return id;
  };

  const outboxCount = async (documentJobId: string): Promise<number> =>
    prisma.notificationOutbox.count({
      where: { idempotencyKey: documentJobTerminalOutboxKey(documentJobId, 'failed') },
    });

  const previousStaleEnv = process.env.DOCUMENT_JOB_STALE_TIMEOUT_MS;
  process.env.DOCUMENT_JOB_STALE_TIMEOUT_MS = '300000'; // 5 min (policy minimum)
  const service = new DocumentConversionEventsService(
    queue as never,
    new DocumentJobsService(prisma),
    {
      emitDocumentJobUpdated: (...args: unknown[]) => emissions.push(args),
    } as never,
    prisma,
  );

  try {
    await prisma.$connect();
    connected = true;
    await queue.waitUntilReady();
    queueReady = true;

    await prisma.user.create({
      data: {
        id: userId,
        username: `ci-stale-doc-${userId}`,
        passwordHash: 'ci-not-a-login-hash',
        role: 'admin',
        isActive: true,
      },
    });

    const stuckRunning = await createJob({ status: 'running', ageMs: 31 * 60 * 1000, withBullJob: true });
    const stuckQueued = await createJob({ status: 'queued', ageMs: 31 * 60 * 1000, withBullJob: true });
    const freshRunning = await createJob({ status: 'running', ageMs: 30 * 1000, withBullJob: true });
    const freshMissing = await createJob({ status: 'queued', ageMs: 10 * 1000, withBullJob: false });
    const oldMissing = await createJob({ status: 'queued', ageMs: 2 * 60 * 1000, withBullJob: false });

    // 1. First reconciliation after the "worker died" fault.
    await service.reconcileStaleJobs();

    for (const id of [stuckRunning, stuckQueued]) {
      const row = await prisma.documentJob.findUniqueOrThrow({ where: { id } });
      assert.equal(row.status, 'failed', `stuck job ${id} must become terminal`);
      assert.equal(row.lastError, DOCUMENT_JOB_STALE_RECOVERY_ERROR);
      assert.ok(row.endedAt, 'terminal job must have endedAt');
      assert.equal(await outboxCount(id), 1, 'exactly one durable terminal notification');
      // BullMQ returns null (older) or undefined (current) for a removed job.
      const bullJob = await queue.getJob(id);
      assert.ok(!bullJob, 'stuck BullMQ job must be removed so a zombie worker cannot resurrect it');
    }

    const freshRow = await prisma.documentJob.findUniqueOrThrow({ where: { id: freshRunning } });
    assert.equal(freshRow.status, 'running', 'a healthy in-flight conversion must not be touched');
    assert.ok(await queue.getJob(freshRunning), 'fresh BullMQ job must remain queued');
    assert.equal(await outboxCount(freshRunning), 0);

    assert.equal(
      (await prisma.documentJob.findUniqueOrThrow({ where: { id: freshMissing } })).status,
      'queued',
      'a newly created row without a Bull job is inside the grace period',
    );
    const oldMissingRow = await prisma.documentJob.findUniqueOrThrow({ where: { id: oldMissing } });
    assert.equal(oldMissingRow.status, 'failed', 'the pre-existing missing-Bull-job path must still work');

    const emissionsAfterFirst = emissions.length;
    assert.ok(emissionsAfterFirst >= 3, 'each terminal transition must emit one Socket.IO update');

    // 2. Idempotency: a repeated reconciliation must not duplicate anything.
    await service.reconcileStaleJobs();
    for (const id of [stuckRunning, stuckQueued, oldMissing]) {
      assert.equal(await outboxCount(id), 1, `no duplicate outbox row for ${id}`);
    }
    assert.equal(emissions.length, emissionsAfterFirst, 'no duplicate Socket.IO emissions');
    assert.equal(
      (await prisma.documentJob.findUniqueOrThrow({ where: { id: freshRunning } })).status,
      'running',
    );

    console.log(
      'Stale DocumentJob recovery check passed (SIGKILL-like waiting/active jobs become terminal, one durable notification each, healthy jobs untouched, missing-job grace preserved, repeated reconcile idempotent).',
    );
  } finally {
    if (previousStaleEnv === undefined) delete process.env.DOCUMENT_JOB_STALE_TIMEOUT_MS;
    else process.env.DOCUMENT_JOB_STALE_TIMEOUT_MS = previousStaleEnv;
    if (queueReady) {
      for (const id of jobIds) {
        await queue.getJob(id).then((job) => job?.remove().catch(() => undefined)).catch(() => undefined);
      }
    }
    if (connected) {
      await prisma.notificationOutbox.deleteMany({ where: { relatedId: { in: jobIds } } }).catch(() => undefined);
      await prisma.documentJob.deleteMany({ where: { id: { in: jobIds } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    }
    await Promise.all([queue.close().catch(() => undefined), prisma.$disconnect().catch(() => undefined)]);
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
