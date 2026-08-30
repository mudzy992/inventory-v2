import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { QueueEvents, type Queue } from 'bullmq';
import { buildBaseRedisOptions, readRedisConfig } from '../../redis/redis.config';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { DOCUMENT_GENERATION_QUEUE, type DocumentConversionJobPayload } from './document-generation.queue';
import { DocumentJobsService } from './document-jobs.service';

/**
 * Most između BullMQ `document-generation` reda i:
 *  1) `DocumentJob` Postgres reda (system-od-istine za status),
 *  2) Socket.IO obavještenja pozivaocu (job started/completed/failed).
 *
 * NAMJERNO zaseban od `DocumentConversionQueueService` (koji samo
 * enqueue-uje) — ovaj servis SLUŠA. Koristi BullMQ `QueueEvents`, koji
 * interno koristi Redis Streams (XREAD blocking), ne polling — budi se
 * isključivo kad worker (zaseban Document Worker kontejner, ne backend)
 * javi progres/rezultat.
 *
 * Document Worker sam NE dodiruje Postgres niti Socket.IO — namjerno, da bi
 * mu ACL/mrežni surface ostao minimalan (samo BullMQ komande nad istim
 * Redis ACL userom kao i backend, vidi README/deploy napomene). Sav domenski
 * upis (DB, notifikacije) dešava se ovdje, u backend procesu.
 */
@Injectable()
export class DocumentConversionEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentConversionEventsService.name);
  private queueEvents?: QueueEvents;

  constructor(
    @InjectQueue(DOCUMENT_GENERATION_QUEUE)
    private readonly queue: Queue<DocumentConversionJobPayload>,
    private readonly documentJobs: DocumentJobsService,
    private readonly gateway: NotificationsGateway,
  ) {}

  onModuleInit(): void {
    const config = readRedisConfig();
    this.queueEvents = new QueueEvents(DOCUMENT_GENERATION_QUEUE, {
      connection: buildBaseRedisOptions(config),
      prefix: config.keyPrefix.replace(/:$/, ''),
    });

    this.queueEvents.on('active', ({ jobId }) => {
      void this.handleActive(jobId);
    });
    this.queueEvents.on('completed', ({ jobId }) => {
      void this.handleCompleted(jobId);
    });
    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      void this.handleFailed(jobId, failedReason);
    });
    this.queueEvents.on('error', (err) => {
      // QueueEvents (i njegova interna Redis konekcija) se sama re-konektuje
      // uz ugrađeni ioredis retryStrategy — greška ovdje je samo
      // dijagnostička, ne fatalna.
      this.logger.warn(`QueueEvents connection error (auto-retrying): ${String(err)}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queueEvents?.close();
  }

  private async handleActive(jobId: string): Promise<void> {
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) return;
      const { documentJobId } = job.data;
      await this.documentJobs.markRunning(documentJobId);
      await this.notify(documentJobId, 'running');
    } catch (err) {
      this.logger.warn(`handleActive(${jobId}) failed: ${String(err)}`);
    }
  }

  private async handleCompleted(jobId: string): Promise<void> {
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) return;
      const { documentJobId } = job.data;
      await this.documentJobs.markDone(documentJobId);
      await this.notify(documentJobId, 'done');
    } catch (err) {
      this.logger.warn(`handleCompleted(${jobId}) failed: ${String(err)}`);
    }
  }

  private async handleFailed(jobId: string, failedReason: string): Promise<void> {
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) return;
      const { documentJobId } = job.data;
      const attemptsMade = job.attemptsMade ?? 0;
      const maxAttempts = job.opts.attempts ?? 1;
      await this.documentJobs.incrementAttempts(documentJobId);
      if (attemptsMade >= maxAttempts) {
        // Konačan neuspjeh — BullMQ neće više retry-ovati ovaj posao.
        await this.documentJobs.markFailed(documentJobId, failedReason, attemptsMade);
        await this.notify(documentJobId, 'failed', failedReason);
      } else {
        // BullMQ će sam re-pokušati (exponential/fixed backoff, vidi
        // DocumentConversionQueueService) — status ostaje 'queued'/'running'
        // do sljedećeg pokušaja, korisniku se ne prijavljuje lažni "failed".
        this.logger.debug(
          `Document job ${documentJobId} attempt ${attemptsMade}/${maxAttempts} failed, BullMQ will retry: ${failedReason}`,
        );
      }
    } catch (err) {
      this.logger.warn(`handleFailed(${jobId}) failed: ${String(err)}`);
    }
  }

  private async notify(
    documentJobId: string,
    status: 'running' | 'done' | 'failed',
    error?: string,
  ): Promise<void> {
    const documentJob = await this.documentJobs.findById(documentJobId);
    if (!documentJob?.requestedByUserId) {
      return;
    }
    this.gateway.emitDocumentJobUpdated(documentJob.requestedByUserId, {
      jobId: documentJob.id,
      sourceType: documentJob.sourceType,
      sourceId: documentJob.sourceId,
      status,
      error: error ?? null,
    });
  }
}
