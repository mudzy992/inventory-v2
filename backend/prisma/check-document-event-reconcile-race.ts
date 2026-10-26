import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import type { DocumentConversionJobResult, DocumentConversionJobPayload } from '../src/modules/documents/document-generation.queue';
import { DOCUMENT_CONVERT_JOB_NAME, DOCUMENT_GENERATION_QUEUE } from '../src/modules/documents/document-generation.queue';
import { DocumentConversionEventsService } from '../src/modules/documents/document-conversion-events.service';
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
    throw new Error('Document event reconciliation check is restricted to the local inventory_ci test database');
  }
};

const withTimeout = async <T>(promise: Promise<T>, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 10_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const main = async (): Promise<void> => {
  assertTestDatabase();
  const prisma = new PrismaService();
  const documentJobId = randomUUID();
  const sourceId = randomUUID();
  let connected = false;
  let releaseProcessor: (() => void) | undefined;
  let workerStarted = false;
  let worker: Worker<DocumentConversionJobPayload, DocumentConversionJobResult> | undefined;
  let queue: Queue<DocumentConversionJobPayload> | undefined;

  try {
    await prisma.$connect();
    connected = true;

    await prisma.documentJob.create({
      data: {
        id: documentJobId,
        sourceType: 'ci-startup-reconcile-race',
        sourceId,
        sourceFormat: 'docx',
        targetFormat: 'pdf',
        sourceRelativePath: 'ci/startup-reconcile/source.docx',
        resultRelativePath: 'ci/startup-reconcile/result.pdf',
        status: 'queued',
      },
    });
    const documentJobs = new DocumentJobsService(prisma);

    const redisConfig = readRedisConfig();
    const bullOptions = {
      connection: buildBaseRedisOptions(redisConfig),
      prefix: redisConfig.keyPrefix.replace(/:$/, ''),
    };
    queue = new Queue<DocumentConversionJobPayload>(DOCUMENT_GENERATION_QUEUE, bullOptions);
    let signalStarted!: () => void;
    const started = new Promise<void>((resolveStarted) => {
      signalStarted = resolveStarted;
    });
    const processorGate = new Promise<void>((resolveProcessor) => {
      releaseProcessor = resolveProcessor;
    });
    worker = new Worker<DocumentConversionJobPayload, DocumentConversionJobResult>(
      DOCUMENT_GENERATION_QUEUE,
      async (job) => {
        if (job.id === documentJobId) {
          workerStarted = true;
          signalStarted();
          await processorGate;
        }
        return {
          documentJobId: job.data.documentJobId,
          resultRelativePath: job.data.resultRelativePath,
        };
      },
      bullOptions,
    );
    await worker.waitUntilReady();

    const completed = new Promise<void>((resolveCompleted) => {
      worker?.on('completed', (job) => {
        if (job.id === documentJobId) resolveCompleted();
      });
    });
    await queue.add(
      DOCUMENT_CONVERT_JOB_NAME,
      {
        documentJobId,
        sourceFormat: 'docx',
        targetFormat: 'pdf',
        sourceRelativePath: 'ci/startup-reconcile/source.docx',
        resultRelativePath: 'ci/startup-reconcile/result.pdf',
      },
      { jobId: documentJobId, attempts: 1 },
    );
    await withTimeout(started, 'document worker activation');
    assert.ok(workerStarted);
    await documentJobs.attachBullJobId(documentJobId, documentJobId);
    await documentJobs.markRunning(documentJobId);

    // Model the one-time startup reconciliation observing an active BullMQ
    // job before QueueEvents has captured its completion event.
    const events = new DocumentConversionEventsService(
      queue,
      documentJobs,
      { emitDocumentJobUpdated: () => undefined } as never,
      prisma,
    );
    await events.reconcileStaleJobs();
    const beforeCompletion = await documentJobs.findById(documentJobId);
    assert.equal(beforeCompletion?.status, 'running');

    releaseProcessor?.();
    await withTimeout(completed, 'BullMQ completion without a QueueEvents subscriber');
    const afterMissedEvent = await documentJobs.findById(documentJobId);
    assert.equal(
      afterMissedEvent?.status,
      'running',
      'without the completion event, the first reconciliation leaves the active DB state unchanged',
    );

    // This is the periodic reconciler pass: the terminal BullMQ state is now
    // visible and must repair the DB row even though QueueEvents missed it.
    await events.reconcileStaleJobs();
    const recovered = await documentJobs.findById(documentJobId);
    assert.equal(recovered?.status, 'done');
    assert.ok(recovered?.endedAt);
    assert.equal(recovered?.lastError, null);

    console.log('Verified a lost QueueEvents completion is recovered by the periodic DocumentJob reconciler.');
  } finally {
    releaseProcessor?.();
    try {
      await worker?.close(true);
      const bullJob = queue ? await queue.getJob(documentJobId) : null;
      await bullJob?.remove();
      await queue?.close();
    } finally {
      if (connected) {
        await prisma.documentJob.deleteMany({
          where: { sourceType: 'ci-startup-reconcile-race', sourceId },
        });
      }
      await prisma.$disconnect();
    }
  }
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(error);
  console.log(`::error title=Document event reconciliation race::${message.replaceAll('%', '%25').replaceAll(/[\r\n]/gu, ' ')}`);
  process.exitCode = 1;
});
