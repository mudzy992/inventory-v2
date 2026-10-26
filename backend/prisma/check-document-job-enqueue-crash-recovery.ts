import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Queue } from 'bullmq';
import { DocumentConversionEventsService } from '../src/modules/documents/document-conversion-events.service';
import { DocumentConversionQueueService } from '../src/modules/documents/document-conversion-queue.service';
import {
  DOCUMENT_GENERATION_QUEUE,
  type DocumentConversionJobPayload,
} from '../src/modules/documents/document-generation.queue';
import { DocumentJobsService } from '../src/modules/documents/document-jobs.service';
import { buildBaseRedisOptions, readRedisConfig } from '../src/redis/redis.config';
import { PrismaService } from '../src/prisma/prisma.service';

const assertTestDatabase = (): void => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ''));
  if (
    process.env.NODE_ENV !== 'test' ||
    !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
    databaseName !== 'inventory_ci'
  ) {
    throw new Error('Document job enqueue crash check is restricted to the local inventory_ci test database');
  }
};

const enqueueThenCrashBeforeBullAdd = async (sourceId: string): Promise<never> => {
  assertTestDatabase();
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    const documentJobs = new DocumentJobsService(prisma);
    const queue = {
      add: async (_jobName: string, payload: DocumentConversionJobPayload) => {
        const row = await prisma.documentJob.findUniqueOrThrow({ where: { id: payload.documentJobId } });
        assert.equal(row.status, 'queued', 'DocumentJob must be committed before BullMQ enqueue');
        assert.equal(row.bullJobId, null, 'BullMQ job ID must not be attached before enqueue');
        assert.equal(row.sourceId, sourceId);
        process.kill(process.pid, 'SIGKILL');
      },
    };
    const service = new DocumentConversionQueueService(queue as never, documentJobs);
    await service.enqueuePdfConversion({
      sourceType: 'transfer',
      sourceId,
      sourceFormat: 'docx',
      sourceRelativePath: 'ci/document-job-crash/source.docx',
      resultRelativePath: 'ci/document-job-crash/result.pdf',
    });
    throw new Error('Expected SIGKILL after DocumentJob create and before BullMQ add');
  } finally {
    await prisma.$disconnect();
  }
};

const main = async (): Promise<void> => {
  assertTestDatabase();
  const prisma = new PrismaService();
  const sourceId = randomUUID();
  let connected = false;
  let queue: Queue<DocumentConversionJobPayload> | undefined;
  let events: DocumentConversionEventsService | undefined;
  let eventsInitialized = false;

  try {
    await prisma.$connect();
    connected = true;

    const crashedEnqueue = spawnSync(
      process.execPath,
      ['--import', 'tsx', resolve(process.cwd(), 'prisma/check-document-job-enqueue-crash-recovery.ts')],
      {
        env: {
          ...process.env,
          DOCUMENT_JOB_CRASH_SOURCE_ID: sourceId,
        },
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    assert.equal(
      crashedEnqueue.signal,
      'SIGKILL',
      `process must die after DB create and before BullMQ add; child result: ${JSON.stringify({ status: crashedEnqueue.status, stdout: crashedEnqueue.stdout, stderr: crashedEnqueue.stderr })}`,
    );

    const documentJobs = new DocumentJobsService(prisma);
    const orphaned = await documentJobs.findLatestForSource('transfer', sourceId);
    assert.ok(orphaned, 'DocumentJob create must commit before the process crash');
    const orphanedId = orphaned.id;
    assert.equal(orphaned.status, 'queued');
    assert.equal(orphaned.bullJobId, null);
    assert.equal(orphaned.attempts, 0);
    assert.equal(orphaned.sourceType, 'transfer');
    assert.equal(orphaned.sourceId, sourceId);

    const redisConfig = readRedisConfig();
    queue = new Queue<DocumentConversionJobPayload>(DOCUMENT_GENERATION_QUEUE, {
      connection: buildBaseRedisOptions(redisConfig),
      prefix: redisConfig.keyPrefix.replace(/:$/, ''),
    });
    events = new DocumentConversionEventsService(
      queue,
      documentJobs,
      { emitDocumentJobUpdated: () => undefined } as never,
      prisma,
    );
    await events.onModuleInit();
    eventsInitialized = true;

    const reconciled = await documentJobs.findById(orphanedId);
    assert.ok(reconciled);
    assert.equal(reconciled.status, 'failed', 'startup reconciliation must fail a queued DB row with no BullMQ job');
    assert.equal(reconciled.attempts, 0);
    assert.equal(reconciled.lastError, 'Posao izgubljen tokom restarta servisa. Pokušajte ponovo.');
    assert.ok(reconciled.endedAt);

    let queueAddCount = 0;
    const retryQueue = {
      add: async (
        _jobName: string,
        _payload: DocumentConversionJobPayload,
        options: { jobId?: string },
      ) => {
        queueAddCount += 1;
        return { id: options.jobId };
      },
    };
    const retryService = new DocumentConversionQueueService(retryQueue as never, documentJobs);
    const retry = await retryService.enqueuePdfConversion({
      sourceType: 'transfer',
      sourceId,
      sourceFormat: 'docx',
      sourceRelativePath: 'ci/document-job-crash/source.docx',
      resultRelativePath: 'ci/document-job-crash/result.pdf',
    });

    assert.equal(queueAddCount, 1, 'failed orphan must permit a new BullMQ enqueue');
    assert.notEqual(retry.id, orphanedId, 'retry must preserve history in a fresh DocumentJob row');
    assert.equal(retry.status, 'queued');
    assert.equal(retry.bullJobId, retry.id);
    assert.equal(await prisma.documentJob.count({ where: { sourceType: 'transfer', sourceId } }), 2);

    console.log(
      'Verified recovery after SIGKILL between DocumentJob persistence and BullMQ enqueue: orphan is failed on startup and retry creates a fresh job.',
    );
  } finally {
    try {
      if (eventsInitialized) {
        await events?.onModuleDestroy();
      }
      await queue?.close();
    } finally {
      if (connected) {
        await prisma.documentJob.deleteMany({ where: { sourceType: 'transfer', sourceId } });
      }
      await prisma.$disconnect();
    }
  }
};

const reportMainFailure = (error: unknown): void => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(error);
  const workflowMessage = message.replaceAll('%', '%25').replaceAll(/[\r\n]/gu, ' ');
  console.log(`::error title=DocumentJob enqueue crash recovery::${workflowMessage}`);
  process.exitCode = 1;
};

const crashSourceId = process.env.DOCUMENT_JOB_CRASH_SOURCE_ID;
if (crashSourceId) {
  void enqueueThenCrashBeforeBullAdd(crashSourceId).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  void main().catch(reportMainFailure);
}
