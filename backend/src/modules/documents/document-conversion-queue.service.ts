import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { DocumentJob, DocumentSourceFormat } from '../../../generated/prisma/client';
import {
  DOCUMENT_CONVERT_JOB_NAME,
  DOCUMENT_GENERATION_QUEUE,
  type DocumentConversionJobPayload,
} from './document-generation.queue';
import { DocumentJobsService } from './document-jobs.service';

export interface EnqueueConversionInput {
  sourceType: string;
  sourceId: string;
  sourceFormat: DocumentSourceFormat;
  sourceRelativePath: string;
  resultRelativePath: string;
  requestedByUserId?: string | null;
}

/**
 * Enqueue sloj Document Engine-a. Namjerno tanak — sva "da li već treba
 * enqueue-ovati" logika (idempotency) je ovdje, sav domenski kontekst
 * (npr. koji su placeholderi u DOCX obrascu prenosnice) ostaje u pozivaocu
 * (npr. TransferDocumentGenerationService). Ovo drži servis generičkim i
 * ponovo upotrebljivim za buduće tipove dokumenata (izvještaji, popisne
 * liste...) bez izmjene ovog fajla.
 */
@Injectable()
export class DocumentConversionQueueService {
  private readonly logger = new Logger(DocumentConversionQueueService.name);

  constructor(
    @InjectQueue(DOCUMENT_GENERATION_QUEUE)
    private readonly queue: Queue<DocumentConversionJobPayload>,
    private readonly documentJobs: DocumentJobsService,
  ) {}

  /**
   * Vraća postojeći aktivni (queued/running) posao za taj izvor ako
   * postoji — ne dupla enqueue dok je prethodni u toku (isti obrazac kao
   * InventoryCountService.requestSessionClose — provjera DB reda PRIJE
   * poziva queue.add, ne oslanjanje na BullMQ deterministički jobId).
   */
  async enqueuePdfConversion(input: EnqueueConversionInput): Promise<DocumentJob> {
    const existing = await this.documentJobs.findLatestForSource(input.sourceType, input.sourceId);
    if (existing && (existing.status === 'queued' || existing.status === 'running')) {
      this.logger.debug(
        `Conversion already ${existing.status} for ${input.sourceType}:${input.sourceId}, reusing job ${existing.id}`,
      );
      return existing;
    }

    const documentJob = await this.documentJobs.create({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceFormat: input.sourceFormat,
      targetFormat: 'pdf',
      sourceRelativePath: input.sourceRelativePath,
      resultRelativePath: input.resultRelativePath,
      requestedByUserId: input.requestedByUserId,
    });

    const payload: DocumentConversionJobPayload = {
      documentJobId: documentJob.id,
      sourceFormat: input.sourceFormat,
      targetFormat: 'pdf',
      sourceRelativePath: input.sourceRelativePath,
      resultRelativePath: input.resultRelativePath,
    };

    const bullJob = await this.queue.add(DOCUMENT_CONVERT_JOB_NAME, payload, {
      jobId: randomUUID(),
      // LibreOffice greške su rijetko prolazne mrežne "hiccups" — 2 pokušaja
      // (umjesto globalnog default-a od 3, vidi QueuesModule) drži worst-case
      // vrijeme do konačnog 'failed' statusa razumnim, uz kratki fiksni
      // razmak (posao koji je pao zbog zaglavljenog soffice procesa neće se
      // popraviti čekanjem duže od par sekundi).
      attempts: 2,
      backoff: { type: 'fixed', delay: 10_000 },
    });

    await this.documentJobs.attachBullJobId(documentJob.id, bullJob.id ?? '');
    return documentJob;
  }

  /** Ponovo pokreće konverziju za posao koji je završio u 'failed' statusu,
   * koristeći iste izvorne/ciljne putanje. Novi DocumentJob red (ne
   * reciklira stari) radi čistog audit traga. */
  async retry(job: DocumentJob): Promise<DocumentJob> {
    return this.enqueuePdfConversion({
      sourceType: job.sourceType,
      sourceId: job.sourceId,
      sourceFormat: job.sourceFormat,
      sourceRelativePath: job.sourceRelativePath,
      resultRelativePath: job.resultRelativePath,
      requestedByUserId: job.requestedByUserId,
    });
  }
}
