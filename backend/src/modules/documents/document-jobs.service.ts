import { Injectable } from '@nestjs/common';
import type { DocumentJob, DocumentSourceFormat } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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
 * nikad direktno iz BullMQ-a.
 */
@Injectable()
export class DocumentJobsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async attachBullJobId(id: string, bullJobId: string): Promise<void> {
    await this.prisma.documentJob.update({ where: { id }, data: { bullJobId } });
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

  async markRunning(id: string): Promise<void> {
    await this.prisma.documentJob.update({
      where: { id },
      data: { status: 'running', startedAt: new Date(), lastError: null },
    });
  }

  async markDone(id: string): Promise<DocumentJob> {
    return this.prisma.documentJob.update({
      where: { id },
      data: { status: 'done', endedAt: new Date(), lastError: null },
    });
  }

  async markFailed(id: string, error: string, attempts: number): Promise<DocumentJob> {
    return this.prisma.documentJob.update({
      where: { id },
      data: { status: 'failed', endedAt: new Date(), lastError: error, attempts },
    });
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.prisma.documentJob.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }
}
