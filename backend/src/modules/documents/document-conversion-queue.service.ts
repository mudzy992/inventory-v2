import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
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

const isUniqueConstraintError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002';

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
   * poziva queue.add).
   *
   * Provjera-pa-upis (findLatestForSource + create) je TOCTOU-podložna pod
   * konkurentnim pozivima (npr. dva brza klika/dva paralelna zahtjeva) —
   * zaštićeno DODATNO na DB nivou parcijalnim unique indeksom
   * `document_jobs_active_source_unique` (vidi migraciju
   * 20260831062751_*), koji odbija DRUGI red sa istim (sourceType,
   * sourceId) dok je prvi još queued/running. Na P2002 (unique violation)
   * ovdje se NE baca greška pozivaocu — vraća se postojeći (pobjednički)
   * posao, isto kao da smo ga zatekli pre-check-om.
   */
  async enqueuePdfConversion(input: EnqueueConversionInput): Promise<DocumentJob> {
    const existing = await this.documentJobs.findLatestForSource(input.sourceType, input.sourceId);
    if (existing && (existing.status === 'queued' || existing.status === 'running')) {
      this.logger.debug(
        `Conversion already ${existing.status} for ${input.sourceType}:${input.sourceId}, reusing job ${existing.id}`,
      );
      return existing;
    }

    let documentJob: DocumentJob;
    try {
      documentJob = await this.documentJobs.create({
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceFormat: input.sourceFormat,
        targetFormat: 'pdf',
        sourceRelativePath: input.sourceRelativePath,
        resultRelativePath: input.resultRelativePath,
        requestedByUserId: input.requestedByUserId,
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        // Neko drugi je "pobijedio" trku između našeg findLatestForSource
        // provjere i ovog create() poziva — DB indeks je to spriječio.
        // Vraćamo pobjednički (upravo kreirani) red umjesto duple konverzije.
        const winner = await this.documentJobs.findLatestForSource(input.sourceType, input.sourceId);
        if (winner) {
          this.logger.debug(
            `Concurrent enqueue detected for ${input.sourceType}:${input.sourceId}, reusing winning job ${winner.id}`,
          );
          return winner;
        }
      }
      throw err;
    }

    // BullMQ jobId == DocumentJob.id (namjerno deterministički, NE
    // randomUUID()) — QueueEvents handleri (active/completed) time mogu
    // koristiti jobId direktno kao documentJobId, bez dodatnog
    // queue.getJob() poziva (manje Redis round-trip-ova, i nema race-a
    // ako bi posao već bio uklonjen/istekao prije nego stignemo da ga
    // pročitamo). Kolizija je nemoguća — documentJob.id je svježi UUID.
    const payload: DocumentConversionJobPayload = {
      documentJobId: documentJob.id,
      sourceFormat: input.sourceFormat,
      targetFormat: 'pdf',
      sourceRelativePath: input.sourceRelativePath,
      resultRelativePath: input.resultRelativePath,
    };

    try {
      const bullJob = await this.queue.add(DOCUMENT_CONVERT_JOB_NAME, payload, {
        jobId: documentJob.id,
        // LibreOffice greške su rijetko prolazne mrežne "hiccups" — 2
        // pokušaja (umjesto globalnog default-a od 3, vidi QueuesModule)
        // drži worst-case vrijeme do konačnog 'failed' statusa razumnim,
        // uz kratki fiksni razmak (posao koji je pao zbog zaglavljenog
        // soffice procesa neće se popraviti čekanjem duže od par sekundi).
        attempts: 2,
        backoff: { type: 'fixed', delay: 10_000 },
      });
      await this.documentJobs.attachBullJobId(documentJob.id, bullJob.id ?? documentJob.id);
    } catch (err) {
      // Ako Redis/BullMQ zakaže TAČNO ovdje (nakon što je DB red već
      // kreiran kao 'queued'), red NE SMIJE ostati zauvijek "queued" bez
      // ikoga ko će ga ikad obraditi (i, zbog unique indeksa, blokirati
      // SVAKI budući pokušaj generisanja za taj izvor). Odmah ga
      // označavamo 'failed' sa jasnom porukom — retry endpoint ga onda
      // može normalno ponovo zakazati.
      this.logger.error(
        `queue.add failed after DocumentJob ${documentJob.id} was created — marking as failed: ${String(err)}`,
      );
      await this.documentJobs.markFailed(
        documentJob.id,
        'Zakazivanje posla nije uspjelo (Redis nedostupan). Pokušajte ponovo.',
        0,
      );
      throw err;
    }

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

