import { recordConditionalTransition } from '../../common/metrics/business-transition-metrics.registry';
import { Injectable } from '@nestjs/common';
import type { DocumentJob, DocumentSourceFormat, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  buildDocumentJobTerminalOutboxRow,
  type DocumentJobTerminalStatus,
} from './document-job-terminal-outbox.util';

export interface CreateDocumentJobInput {
  sourceType: string;
  sourceId: string;
  sourceFormat: DocumentSourceFormat;
  targetFormat: string;
  sourceRelativePath: string;
  resultRelativePath: string;
  requestedByUserId?: string | null;
}

/**
 * Perzistencija za `DocumentJob` — DB red je "system-od-istine" za status
 * posla konverzije dokumenta (isti obrazac kao `InventorySessionCloseJob` u
 * modules/inventory-count/). BullMQ posao je samo trigger za izvršavanje;
 * frontend i ostatak backend-a čitaju status ISKLJUČIVO preko ove tabele,
 * nikad direktno iz BullMQ-a. Terminalne `done`/`failed` tranzicije u istoj
 * DB transakciji upisuju idempotentni notification outbox red, pa korisnik
 * dobija trajnu obavijest čak i ako Socket.IO `document.job.updated` signal
 * ne stigne.
 */
@Injectable()
export class DocumentJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService?: SettingsService,
  ) {}

  /** Durable terminal notifications are best-effort with respect to settings
   * reads: if the settings store is temporarily unavailable we preserve the
   * notification rather than silently dropping it. */
  private async shouldCreateTerminalOutbox(createOutbox: boolean): Promise<boolean> {
    if (!createOutbox || !this.settingsService) return createOutbox;
    try {
      return await this.settingsService.getBooleanValue('notifications.enabled', true);
    } catch {
      return true;
    }
  }

  private async finalizeTerminalStatus(
    id: string,
    status: DocumentJobTerminalStatus,
    error: string | null,
    attempts: number | null,
    createOutbox: boolean,
  ): Promise<DocumentJob | null> {
    const persistOutbox = await this.shouldCreateTerminalOutbox(createOutbox);
    return this.prisma.$transaction(async (tx) => {
      const activeWhere: Prisma.DocumentJobWhereInput = {
        id,
        status: { in: ['queued', 'running'] },
      };
      const result =
        status === 'done'
          ? await tx.documentJob.updateMany({
              where: activeWhere,
              data: { status: 'done', endedAt: new Date(), lastError: null },
            })
          : await tx.documentJob.updateMany({
              where: activeWhere,
              data: {
                status: 'failed',
                endedAt: new Date(),
                lastError: error,
                attempts: attempts ?? 0,
              },
            });
      recordConditionalTransition('document_job_terminal', result.count, {
        fromStatus: 'queued|running',
        toStatus: status,
        terminal: status === 'done' ? 'done' : 'failed',
      });
      if (result.count !== 1) return null;

      const job = await tx.documentJob.findUnique({ where: { id } });
      if (persistOutbox && job?.requestedByUserId) {
        const recipient = await tx.user.findUnique({
          where: { id: job.requestedByUserId },
          select: { id: true, isActive: true },
        });
        if (recipient?.isActive) {
          await tx.notificationOutbox.createMany({
            data: [buildDocumentJobTerminalOutboxRow(id, recipient.id, status, error)],
            skipDuplicates: true,
          });
        }
      }
      return job;
    });
  }

  async create(input: CreateDocumentJobInput): Promise<DocumentJob> {
    return this.prisma.documentJob.create({
      data: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceFormat: input.sourceFormat,
        targetFormat: input.targetFormat,
        sourceRelativePath: input.sourceRelativePath,
        resultRelativePath: input.resultRelativePath,
        requestedByUserId: input.requestedByUserId ?? null,
        status: 'queued',
      },
    });
  }

  async attachBullJobId(id: string, bullJobId: string): Promise<DocumentJob> {
    return this.prisma.documentJob.update({ where: { id }, data: { bullJobId } });
  }

  async findById(id: string): Promise<DocumentJob | null> {
    return this.prisma.documentJob.findUnique({ where: { id } });
  }

  /** Najnoviji posao za dati (sourceType, sourceId) par — koristi se za
   * idempotentnu provjeru "da li već postoji posao u toku" prije
   * enqueue-ovanja novog, i za status polling endpoint. */
  async findLatestForSource(sourceType: string, sourceId: string): Promise<DocumentJob | null> {
    return this.prisma.documentJob.findFirst({
      where: { sourceType, sourceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Svi redovi `queued`/`running` — koristi ih početna i periodična
   * rekonsilijacija da uskladi DB sa stvarnim BullMQ stanjem kada je event
   * propušten tokom restarta ili race-a pri pokretanju QueueEvents-a. */
  async findActiveJobs(): Promise<DocumentJob[]> {
    return this.prisma.documentJob.findMany({
      where: { status: { in: ['queued', 'running'] } },
    });
  }

  /** Compare-and-set status updates prevent late QueueEvents handlers from
   * reopening a terminal row after a faster `completed`/`failed` handler. */
  async markRunning(id: string): Promise<boolean> {
    const result = await this.prisma.documentJob.updateMany({
      where: { id, status: { in: ['queued', 'running'] } },
      data: { status: 'running', startedAt: new Date(), lastError: null },
    });
    recordConditionalTransition('document_job_running', result.count, {
      fromStatus: 'queued|running',
      toStatus: 'running',
    });
    return result.count === 1;
  }

  async markDone(id: string, createOutbox = true): Promise<DocumentJob | null> {
    return this.finalizeTerminalStatus(id, 'done', null, null, createOutbox);
  }

  async markFailed(
    id: string,
    error: string,
    attempts: number,
    createOutbox = true,
  ): Promise<DocumentJob | null> {
    return this.finalizeTerminalStatus(id, 'failed', error, attempts, createOutbox);
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.prisma.documentJob.updateMany({
      where: { id, status: { in: ['queued', 'running'] } },
      data: { attempts: { increment: 1 } },
    });
  }
}
