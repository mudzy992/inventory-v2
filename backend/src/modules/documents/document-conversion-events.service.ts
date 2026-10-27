import { logStructuredEvent, safeErrorText } from '../../common/logging/structured-event.logger';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { QueueEvents, type Queue } from 'bullmq';
import { buildBullMqRedisOptions, readRedisConfig } from '../../redis/redis.config';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { DOCUMENT_GENERATION_QUEUE, type DocumentConversionJobPayload } from './document-generation.queue';
import { DocumentJobsService } from './document-jobs.service';
import {
  DOCUMENT_JOB_STALE_RECOVERY_ERROR,
  DEFAULT_DOCUMENT_JOB_STALE_MS,
  decideStaleRecovery,
  resolveDocumentJobStaleMs,
} from './document-job-recovery-policy.util';
import { runWithCorrelationId } from '../../common/utils/correlation-id.util';

/** Uklanja apsolutne putanje (unutar kontejnera) iz poruka grešaka prije
 * nego što se upišu u `DocumentJob.lastError` (čita ga API/frontend preko
 * getPdfJobStatus) ili emituju preko Socket.IO — container filesystem
 * layout (/app/uploads/..., /tmp/document-worker/...) nije nešto što
 * krajnji korisnik treba vidjeti. Puna, neredigovana poruka i dalje ide u
 * server-side log (vidi handleFailed ispod), gdje je dostupna za
 * dijagnostiku. */
const CLIENT_ERROR_MAX_LENGTH = 300;
const DOCUMENT_JOB_RECONCILE_INTERVAL_MS = 30_000;
const MISSING_BULL_JOB_GRACE_MS = 60_000;
const ABSOLUTE_PATH_RE = /\/[\w.-]+(?:\/[\w.-]+)+/g;
const sanitizeErrorForClient = (message: string): string =>
  message.replace(ABSOLUTE_PATH_RE, '[putanja]').slice(0, CLIENT_ERROR_MAX_LENGTH);

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
 *
 * RESTART OTPORNOST: `QueueEvents` čita Redis Stream od trenutka
 * konekcije — evente koji su se desili dok je backend bio ugašen neće
 * dobiti nakon restarta. Zato se prvo pokreće QueueEvents i registruju se
 * handleri, pa se nakon uspostavljanja Redis konekcije radi početna
 * rekonsilijacija DB redova `queued`/'running'. Dodatna provjera svakih 30
 * sekundi zatvara i preostali prozor između BullMQ state check-a i početka
 * stream čitanja, kao i slučaj propuštenog QueueEvent-a. Ako Redis nije
 * dostupan pri bootu, backend ne čeka: QueueEvents se reconnectuje, a
 * početna rekonsilijacija se pokrene kada konekcija postane spremna. Worker
 * restart/crash i dalje ostavlja BullMQ-u da označi posao kao stalled i
 * ponovi ga.
 *
 * `done`/`failed` su terminalni statusi: QueueEvents handleri se izvršavaju
 * asinhrono i mogu stići različitim redoslijedom, pa sve promjene statusa
 * koriste uslovni DB update. Samo handler koji stvarno izvrši terminalnu
 * tranziciju smije pokrenuti domenski sync i Socket.IO notifikaciju.
 */
@Injectable()
export class DocumentConversionEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentConversionEventsService.name);
  private queueEvents?: QueueEvents;
  private reconcilingStaleJobs = false;

  constructor(
    @InjectQueue(DOCUMENT_GENERATION_QUEUE)
    private readonly queue: Queue<DocumentConversionJobPayload>,
    private readonly documentJobs: DocumentJobsService,
    private readonly gateway: NotificationsGateway,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const config = readRedisConfig();
    const queueEvents = new QueueEvents(DOCUMENT_GENERATION_QUEUE, {
      connection: buildBullMqRedisOptions(config),
      prefix: config.keyPrefix.replace(/:$/, ''),
    });
    this.queueEvents = queueEvents;

    queueEvents.on('active', ({ jobId }) => {
      void runWithCorrelationId(`document-job:${jobId}`, () => this.handleActive(jobId));
    });
    queueEvents.on('completed', ({ jobId }) => {
      void runWithCorrelationId(`document-job:${jobId}`, () => this.handleCompleted(jobId));
    });
    queueEvents.on('failed', ({ jobId, failedReason }) => {
      void runWithCorrelationId(`document-job:${jobId}`, () => this.handleFailed(jobId, failedReason));
    });
    queueEvents.on('error', (err) => {
      // QueueEvents (i njegova interna Redis konekcija) se sama re-konektuje
      // uz ugrađeni ioredis retryStrategy — greška ovdje je samo
      // dijagnostička, ne fatalna.
      logStructuredEvent(this.logger, 'warn', {
        event: 'document_queue_events_connection_error',
        error: safeErrorText(err),
      });
    });

    // Ne blokiramo boot ako je Redis trenutno nedostupan. QueueEvents se
    // ponovo povezuje; čim stream pretplata bude spremna, usklađujemo DB
    // stanja da pokrijemo događaje koji su se desili tokom reconnect-a.
    void queueEvents
      .waitUntilReady()
      .then(() => this.reconcileStaleJobs())
      .catch((error: unknown) => {
        logStructuredEvent(this.logger, 'warn', {
          event: 'document_startup_reconcile_queue_events_unavailable',
          error: safeErrorText(error),
        });
      });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queueEvents?.close();
  }

  /** Vidi napomenu o RESTART OTPORNOSTI iznad klase. Best-effort — greška
   * ovdje NIKAD ne smije spriječiti normalan boot backend-a (npr. ako
   * Redis trenutno nije dostupan pri startu, QueueEvents auto-retry
   * konekcije i redovni event tok će s vremenom sam sebe uskladiti kroz
   * naredne active/completed/failed evente). */
  @Interval(DOCUMENT_JOB_RECONCILE_INTERVAL_MS)
  async reconcileStaleJobs(): Promise<void> {
    if (this.reconcilingStaleJobs) return;
    this.reconcilingStaleJobs = true;
    try {
      let staleJobs;
      try {
        staleJobs = await this.documentJobs.findActiveJobs();
      } catch (err) {
        logStructuredEvent(this.logger, 'warn', {
          event: 'document_stale_job_read_failed',
          error: safeErrorText(err),
        });
        return;
      }
      if (staleJobs.length === 0) return;

      logStructuredEvent(this.logger, 'log', {
        event: 'document_stale_job_reconcile_started',
        count: staleJobs.length,
      });
      let staleMs = DEFAULT_DOCUMENT_JOB_STALE_MS;
      try {
        staleMs = resolveDocumentJobStaleMs(process.env.DOCUMENT_JOB_STALE_TIMEOUT_MS);
      } catch (err) {
        // A misconfiguration must not disable recovery: log and use the
        // default bound so no job can stay ownerless forever.
        logStructuredEvent(this.logger, 'warn', {
          event: 'document_stale_timeout_config_invalid',
          error: safeErrorText(err),
          fallbackMs: DEFAULT_DOCUMENT_JOB_STALE_MS,
        });
      }
      for (const documentJob of staleJobs) {
        try {
          // BullMQ jobId === DocumentJob.id (vidi DocumentConversionQueueService).
          const bullJob = await this.queue.getJob(documentJob.id);
          const state = bullJob ? await bullJob.getState() : 'missing';
          const decision = decideStaleRecovery({
            job: documentJob,
            bullJobPresent: Boolean(bullJob),
            bullJobState: state,
            now: Date.now(),
            staleMs,
            missingGraceMs: MISSING_BULL_JOB_GRACE_MS,
          });

          if (decision === 'missing') {
            // Nakon grace perioda, red bez BullMQ posla je stale i postaje
            // failed da bi se mogao ručno ponoviti.
            const failedJob = await this.documentJobs.markFailed(
              documentJob.id,
              'Posao izgubljen tokom restarta servisa. Pokušajte ponovo.',
              documentJob.attempts,
            );
            if (failedJob) {
              await this.notify(documentJob.id, 'failed', 'Posao izgubljen tokom restarta servisa.');
            }
            continue;
          }

          if (decision === 'stuck') {
            // BullMQ posao je i dalje waiting/active/delayed, ali je stariji
            // od dozvoljenog bound-a: worker je pao i niko ga neće završiti.
            // Terminalni DB status je monotonic, pa kasni QueueEvent ne može
            // ponovo otvoriti posao niti duplirati notifikaciju.
            const failedJob = await this.documentJobs.markFailed(
              documentJob.id,
              DOCUMENT_JOB_STALE_RECOVERY_ERROR,
              documentJob.attempts,
            );
            if (failedJob) {
              logStructuredEvent(this.logger, 'warn', {
                event: 'document_job_stale_recovered_failed',
                documentJobId: documentJob.id,
                bullJobState: state,
                ageMs: Date.now() - documentJob.createdAt.getTime(),
                staleTimeoutMs: staleMs,
              });
              await this.notify(documentJob.id, 'failed', DOCUMENT_JOB_STALE_RECOVERY_ERROR);
              // Best effort: ukloni BullMQ posao da zombi worker ne bi kasnije
              // pisao fajl za već terminalni DB red. Zaključan 'active' posao
              // se ne može ukloniti — to je benigno, DB status je autoritet.
              await bullJob?.remove().catch(() => undefined);
            }
            continue;
          }

          if (state === 'completed') {
            const completedJob = await this.documentJobs.markDone(documentJob.id);
            if (completedJob) {
              await this.syncCompletedDocument(completedJob);
              await this.notify(documentJob.id, 'done');
            }
          } else if (state === 'failed') {
            const attemptsMade = bullJob?.attemptsMade ?? 0;
            const maxAttempts = bullJob?.opts.attempts ?? 1;
            if (attemptsMade >= maxAttempts) {
              const reason = sanitizeErrorForClient(bullJob?.failedReason ?? 'Konverzija nije uspjela.');
              const failedJob = await this.documentJobs.markFailed(documentJob.id, reason, attemptsMade);
              if (failedJob) {
                await this.notify(documentJob.id, 'failed', reason);
              }
            }
            // else: BullMQ će sam re-pokušati — normalni 'active' event će
            // uskoro stići preko QueueEvents, ne diramo status ovdje.
          }
          // Svjež 'waiting'/'active'/'delayed'/'prioritized' posao još ima
          // vlasnika — rekonsilijacija ga ne dira. Ako vlasnik nestane,
          // 'stuck' grana iznad ga preuzima nakon staleMs.
        } catch (err) {
          logStructuredEvent(this.logger, 'warn', {
            event: 'document_stale_job_reconcile_failed',
            documentJobId: documentJob.id,
            error: safeErrorText(err),
          });
        }
      }
    } finally {
      this.reconcilingStaleJobs = false;
    }
  }

  private async handleActive(jobId: string): Promise<void> {
    try {
      // BullMQ jobId === DocumentJob.id (vidi DocumentConversionQueueService)
      // — direktna upotreba bez queue.getJob() poziva: manje Redis
      // round-trip-ova i nema race-a ako bi posao već bio uklonjen prije
      // nego stignemo da ga pročitamo.
      const transitioned = await this.documentJobs.markRunning(jobId);
      if (transitioned) {
        await this.notify(jobId, 'running');
      }
    } catch (err) {
      logStructuredEvent(this.logger, 'warn', {
        event: 'document_job_event_handler_failed',
        handler: 'active',
        jobId,
        error: safeErrorText(err),
      });
    }
  }

  private async handleCompleted(jobId: string): Promise<void> {
    try {
      const documentJob = await this.documentJobs.markDone(jobId);
      if (!documentJob) return;
      await this.syncCompletedDocument(documentJob);
      await this.notify(jobId, 'done');
    } catch (err) {
      logStructuredEvent(this.logger, 'warn', {
        event: 'document_job_event_handler_failed',
        handler: 'completed',
        jobId,
        error: safeErrorText(err),
      });
    }
  }

  private async handleFailed(jobId: string, failedReason: string): Promise<void> {
    try {
      // Za attemptsMade/maxAttempts MORAMO pitati BullMQ direktno (ti
      // podaci nisu dio QueueEvents 'failed' payload-a).
      const job = await this.queue.getJob(jobId);
      const attemptsMade = job?.attemptsMade ?? 0;
      const maxAttempts = job?.opts.attempts ?? 1;
      const sanitizedReason = sanitizeErrorForClient(failedReason);
      if (attemptsMade >= maxAttempts) {
        // Konačan neuspjeh — BullMQ neće više retry-ovati ovaj posao.
        // markFailed upisuje i attempts=attemptsMade direktno, pa nema
        // potrebe za odvojenim incrementAttempts pozivom ovdje (izbjegava
        // suvišan drugi UPDATE za isti red).
        const failedJob = await this.documentJobs.markFailed(jobId, sanitizedReason, attemptsMade);
        if (failedJob) {
          await this.notify(jobId, 'failed', sanitizedReason);
        }
      } else {
        // BullMQ će sam re-pokušati (fiksni backoff, vidi
        // DocumentConversionQueueService) — status ostaje 'queued'/'running'
        // do sljedećeg pokušaja (naredni 'active' event ga potvrđuje),
        // korisniku se ne prijavljuje lažni "failed". Bilježimo samo
        // attempts counter radi vidljivosti u DB-u dok se ne desi sljedeći
        // pokušaj.
        await this.documentJobs.incrementAttempts(jobId);
        logStructuredEvent(this.logger, 'debug', {
          event: 'document_job_retry_scheduled',
          jobId,
          attemptsMade,
          maxAttempts,
          reason: failedReason,
        });
      }
    } catch (err) {
      logStructuredEvent(this.logger, 'warn', {
        event: 'document_job_event_handler_failed',
        handler: 'failed',
        jobId,
        error: safeErrorText(err),
      });
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

  private async syncCompletedDocument(documentJob: {
    sourceType: string;
    sourceId: string;
    resultRelativePath: string;
    }): Promise<void> {
    switch (documentJob.sourceType) {
        case 'transfer':
        await this.prisma.transfer.update({
            where: { id: documentJob.sourceId },
            data: {
            generatedPdfPath: documentJob.resultRelativePath,
            },
        });
        return;

        default:
        // Document Engine podržava i buduće tipove dokumenata.
        // Ako domena nema poseban completion sync, nema dodatnog DB upisa.
        logStructuredEvent(this.logger, 'debug', {
          event: 'document_job_completion_sync_missing',
          sourceType: documentJob.sourceType,
        });
    }
    }
}
