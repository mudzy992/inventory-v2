import { Worker, type Job } from 'bullmq';
import type { WorkerConfig } from './config';
import { convertToPdf } from './convert';
import { buildRedisOptions, bullmqPrefix } from './redis-connection';
import type { DocumentConversionJobPayload, DocumentConversionJobResult } from './types';
import { formatJobCorrelation } from './worker-log.util';

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[document-worker] ${new Date().toISOString()} ${msg}`);
};

const logError = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.error(`[document-worker] ${new Date().toISOString()} ${msg}`);
};

/**
 * Kreira i pokreće BullMQ Worker za `document-generation` red. Čist
 * BullMQ Worker (bez NestJS-a) — konekcija/prefix moraju se poklapati sa
 * backend/src/queues/bullmq.module.ts da bi worker uopšte vidio poslove
 * koje backend enqueue-uje (isti Redis ACL user, isti `${REDIS_KEY_PREFIX}`
 * BullMQ prefix).
 *
 * `concurrency` kontroliše koliko `soffice` procesa istovremeno radi u
 * OVOM kontejneru — svaki dobija izolovan profil (vidi convert.ts), pa je
 * bezbjedno postaviti > 1, ali imajte na umu da je LibreOffice memorijski
 * zahtjevan (vidi docker-compose mem_limit za document-worker servis, i
 * preporuke u DEPLOY.md/README).
 */
export const createDocumentWorker = (config: WorkerConfig): Worker<
  DocumentConversionJobPayload,
  DocumentConversionJobResult
> => {
  const worker = new Worker<DocumentConversionJobPayload, DocumentConversionJobResult>(
    config.queueName,
    async (job: Job<DocumentConversionJobPayload>): Promise<DocumentConversionJobResult> => {
      const correlation = formatJobCorrelation(job.data);
      log(
        `job ${job.id} ${correlation} start documentJobId=${job.data.documentJobId} ` +
          `${job.data.sourceFormat}->${job.data.targetFormat} attempt=${job.attemptsMade + 1}`,
      );
      await convertToPdf(config, {
        documentJobId: job.data.documentJobId,
        sourceFormat: job.data.sourceFormat,
        sourceRelativePath: job.data.sourceRelativePath,
        resultRelativePath: job.data.resultRelativePath,
      });
      log(`job ${job.id} ${correlation} done`);
      return {
        documentJobId: job.data.documentJobId,
        resultRelativePath: job.data.resultRelativePath,
      };
    },
    {
      connection: buildRedisOptions(config.redis),
      prefix: bullmqPrefix(config.redis),
      concurrency: config.concurrency,
      // Standardni BullMQ "lock" produžava se automatski dok je posao
      // aktivan; eksplicitni lockDuration malo veći od convertTimeoutMs
      // sprečava da BullMQ proglasi posao "stalled" (i pokrene ga na drugom
      // replika-kontejneru dok se ovaj još gasi/čisti) usred normalnog,
      // dugog soffice poziva.
      lockDuration: config.convertTimeoutMs + 30_000,
    },
  );

  worker.on('error', (err) => {
    logError(`worker error (auto-retrying connection): ${String(err)}`);
  });
  worker.on('failed', (job, err) => {
    logError(
      `job ${job?.id} ${formatJobCorrelation(job?.data)} failed ` +
        `(attempt ${job?.attemptsMade}): ${err.message}`,
    );
  });
  worker.on('stalled', (jobId) => {
    logError(`job ${jobId} correlationId=unknown stalled — will be retried by BullMQ`);
  });

  return worker;
};
