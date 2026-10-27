import { logStructuredEvent, safeErrorText } from '../../common/logging/structured-event.logger';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import Docxtemplater from 'docxtemplater';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import PizZip from 'pizzip';
import type { Prisma } from '../../../generated/prisma/client';
import { DocumentConversionQueueService } from '../documents/document-conversion-queue.service';
import { DocumentJobsService } from '../documents/document-jobs.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { WarehouseTransferTemplateService } from '../warehouses/warehouse-transfer-template.service';
import { buildTransferTemplateData } from './utils/build-transfer-template-data.util';
import {
  buildGeneratedDocxRelativePath,
  buildGeneratedPdfRelativePath,
} from './utils/transfer-document-path.util';
import { resolveGeneratedDocumentPath } from './utils/resolve-generated-document-path.util';

const transferTemplateInclude = {
  signer: true,
  fromPerson: true,
  toPerson: true,
  fromWarehouse: true,
  toWarehouse: true,
  equipment: { include: { category: true, stockLot: { select: { productName: true } } } },
} satisfies Prisma.TransferInclude;

/** `sourceType` vrijednost korištena u DocumentJob redovima za prenosnice —
 * Document Engine je generički (vidi modules/documents/), ovo je jedini
 * string koji ga vezuje za transfers/ domenu. */
const DOCUMENT_SOURCE_TYPE_TRANSFER = 'transfer';
const DOCX_RECONCILE_INTERVAL_MS = 5_000;
const DOCX_LEASE_DURATION_MS = 2 * 60_000;
const DOCX_RECONCILE_BATCH_SIZE = 20;

@Injectable()
export class TransferDocumentGenerationService implements OnModuleInit {
  private readonly logger = new Logger(TransferDocumentGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly templateService: WarehouseTransferTemplateService,
    private readonly documentConversionQueue: DocumentConversionQueueService,
    private readonly documentJobs: DocumentJobsService,
  ) {}

  private reconcilingDocxJobs = false;

  /** Returns an existing file only when its stored relative path is safely
   * contained in the upload root. Invalid paths are treated as missing so a
   * stale DB row can still be repaired by regeneration. */
  private resolveReadableGeneratedDocument(storedPath: string | null | undefined): string | null {
    if (!storedPath) return null;
    try {
      const absolutePath = resolveGeneratedDocumentPath(
        this.templateService.getUploadRoot(),
        storedPath,
      );
      return existsSync(absolutePath) ? absolutePath : null;
    } catch (error) {
      logStructuredEvent(this.logger, 'warn', {
        event: 'transfer_generated_document_path_rejected',
        error: safeErrorText(error),
      });
      return null;
    }
  }

  onModuleInit(): void {
    void this.reconcileQueuedDocxGenerations();
  }

  @Interval(DOCX_RECONCILE_INTERVAL_MS)
  async reconcileQueuedDocxGenerations(): Promise<void> {
    if (this.reconcilingDocxJobs) {
      return;
    }
    this.reconcilingDocxJobs = true;
    try {
      const now = new Date();
      const transfers = await this.prisma.transfer.findMany({
        where: {
          OR: [
            { generatedDocxStatus: 'queued' },
            {
              generatedDocxStatus: 'running',
              OR: [
                { generatedDocxLeaseUntil: null },
                { generatedDocxLeaseUntil: { lte: now } },
              ],
            },
          ],
        },
        select: { id: true, createdByUserId: true },
        orderBy: { updatedAt: 'asc' },
        take: DOCX_RECONCILE_BATCH_SIZE,
      });
      for (const transfer of transfers) {
        await this.generateForTransfer(transfer.id, transfer.createdByUserId ?? undefined).catch(
          (error: unknown) => {
            logStructuredEvent(this.logger, 'warn', {
              event: 'transfer_docx_queued_generation_failed',
              transferId: transfer.id,
              error: safeErrorText(error),
            });
          },
        );
      }
    } catch (error) {
      logStructuredEvent(this.logger, 'error', {
        event: 'transfer_docx_reconciliation_failed',
        error: safeErrorText(error),
      });
    } finally {
      this.reconcilingDocxJobs = false;
    }
  }

  /**
   * Renderuje DOCX iz aktivnog Word obrasca skladišta (docxtemplater — čist
   * XML/ZIP rad u procesu, brzo, BEZ LibreOffice-a) i, ako je uključeno,
   * NE-BLOKIRAJUĆI enqueue-uje PDF konverziju na Document Worker servis
   * (BullMQ `document-generation` red). Metoda vraća se čim je DOCX upisan
   * — HTTP zahtjev koji je pozvao ovo (kreiranje/potpisivanje prenosnice)
   * više ne čeka LibreOffice; PDF se pojavljuje asinhrono (vidi
   * `getGeneratedFileStream` / `getPdfJobStatus` za status polling, i
   * `NotificationsGateway.emitDocumentJobUpdated` za push obavještenje).
   */
  async generateForTransfer(transferId: string, requestedByUserId?: string): Promise<void> {
    const now = new Date();
    const leaseToken = randomUUID();
    const claimed = await this.prisma.transfer.updateMany({
      where: {
        id: transferId,
        status: { not: 'cancelled' },
        OR: [
          { generatedDocxStatus: 'queued' },
          {
            generatedDocxStatus: 'running',
            OR: [
              { generatedDocxLeaseUntil: null },
              { generatedDocxLeaseUntil: { lte: now } },
            ],
          },
        ],
      },
      data: {
        generatedDocxStatus: 'running',
        generatedDocxLeaseToken: leaseToken,
        generatedDocxLeaseUntil: new Date(now.getTime() + DOCX_LEASE_DURATION_MS),
        generatedDocxAttempts: { increment: 1 },
        generatedDocxError: null,
      },
    });
    if (claimed.count !== 1) {
      return;
    }

    try {
      const transfer = await this.prisma.transfer.findUnique({
        where: { id: transferId },
        include: transferTemplateInclude,
      });
      if (!transfer?.documentWarehouseId) {
        throw new BadRequestException('Transfer nema povezano skladište za generisanje prenosnice');
      }
      const template = await this.templateService.getActiveTemplate(transfer.documentWarehouseId);
      if (!template) {
        throw new BadRequestException(
          'Skladište nema aktivni obrazac prenosnice — uploadujte .docx u Kontekst skladišta',
        );
      }
      const year = transfer.date.getFullYear();
      const templateAbsolute = this.templateService.resolveTemplateAbsolutePath(template.templatePath);
      if (!existsSync(templateAbsolute)) {
        throw new BadRequestException('Aktivni obrazac prenosnice nije pronađen na disku');
      }
      const data = buildTransferTemplateData(transfer);
      const docxBuffer = this.renderDocx(templateAbsolute, data);
      const docxRelative = buildGeneratedDocxRelativePath(
        transfer.documentWarehouseId,
        year,
        transfer.documentNumber,
      );
      const docxAbsolute = resolveGeneratedDocumentPath(
        this.templateService.getUploadRoot(),
        docxRelative,
      );
      mkdirSync(dirname(docxAbsolute), { recursive: true });
      writeFileSync(docxAbsolute, docxBuffer);

      const completed = await this.prisma.transfer.updateMany({
        where: { id: transferId, generatedDocxStatus: 'running', generatedDocxLeaseToken: leaseToken },
        data: {
          generatedDocxPath: docxRelative,
          generatedPdfPath: null,
          generatedDocxStatus: 'done',
          generatedDocxLeaseToken: null,
          generatedDocxLeaseUntil: null,
          generatedDocxError: null,
        },
      });
      if (completed.count !== 1) {
        throw new Error(`DOCX generation lease was lost for transfer ${transferId}`);
      }

      try {
        const generatePdf = await this.settingsService.getBooleanValue(
          'transfer.generate_print_pdf',
          true,
        );
        if (generatePdf) {
          const pdfRelative = buildGeneratedPdfRelativePath(
            transfer.documentWarehouseId,
            year,
            transfer.documentNumber,
          );
          await this.documentConversionQueue.enqueuePdfConversion({
            sourceType: DOCUMENT_SOURCE_TYPE_TRANSFER,
            sourceId: transferId,
            sourceFormat: 'docx',
            sourceRelativePath: docxRelative,
            resultRelativePath: pdfRelative,
            requestedByUserId,
          });
        }
      } catch (error) {
        logStructuredEvent(this.logger, 'warn', {
          event: 'transfer_pdf_enqueue_failed',
          transferId,
          error: safeErrorText(error),
        });
      }
    } catch (error) {
      await this.prisma.transfer.updateMany({
        where: { id: transferId, generatedDocxStatus: 'running', generatedDocxLeaseToken: leaseToken },
        data: {
          generatedDocxStatus: 'failed',
          generatedDocxError: error instanceof Error ? error.message : String(error),
          generatedDocxLeaseToken: null,
          generatedDocxLeaseUntil: null,
        },
      });
      throw error;
    }
  }

  async tryGenerateForTransfer(transferId: string, requestedByUserId?: string): Promise<void> {
    try {
      await this.generateForTransfer(transferId, requestedByUserId);
    } catch (error) {
      logStructuredEvent(this.logger, 'warn', {
        event: 'transfer_docx_generation_failed',
        transferId,
        error: safeErrorText(error),
      });
    }
  }

  async retryDocxGeneration(transferId: string, requestedByUserId?: string): Promise<void> {
    const queued = await this.prisma.transfer.updateMany({
      where: {
        id: transferId,
        status: { not: 'cancelled' },
        documentWarehouseId: { not: null },
        generatedDocxStatus: { in: ['not_requested', 'failed', 'done'] },
      },
      data: {
        generatedDocxStatus: 'queued',
        generatedDocxPath: null,
        generatedPdfPath: null,
        generatedDocxLeaseToken: null,
        generatedDocxLeaseUntil: null,
        generatedDocxError: null,
      },
    });
    if (queued.count === 0) {
      const transfer = await this.prisma.transfer.findUnique({
        where: { id: transferId },
        select: { generatedDocxStatus: true },
      });
      if (!transfer) {
        throw new NotFoundException('Transfer not found');
      }
      if (transfer.generatedDocxStatus !== 'queued' && transfer.generatedDocxStatus !== 'running') {
        throw new BadRequestException('DOCX generation is not available for this transfer');
      }
    }
    await this.generateForTransfer(transferId, requestedByUserId);
  }

  /**
   * Status trenutnog/posljednjeg PDF posla za prenosnicu — koristi ga
   * frontend za polling dok čeka Socket.IO `document.job.updated` event
   * (ili kao fallback ako WebSocket nije povezan). `hasGeneratedPdf` provjerava
   * stvarnu dostupnost fajla, pa `done` posao bez čitljivog rezultata ne mora
   * značiti da je PDF dostupan za preuzimanje.
   */
  async getPdfJobStatus(transferId: string): Promise<{
    status: 'none' | 'queued' | 'running' | 'done' | 'failed';
    jobId: string | null;
    error: string | null;
    docxStatus: 'not_requested' | 'queued' | 'running' | 'done' | 'failed';
    docxError: string | null;
    hasGeneratedDocument: boolean;
    hasGeneratedPdf: boolean;
  }> {
    const [job, transfer] = await Promise.all([
      this.documentJobs.findLatestForSource(DOCUMENT_SOURCE_TYPE_TRANSFER, transferId),
      this.prisma.transfer.findUnique({
        where: { id: transferId },
        select: {
          generatedDocxStatus: true,
          generatedDocxPath: true,
          generatedPdfPath: true,
        },
      }),
    ]);
    const completedJobResult =
      job && job.status === 'done'
        ? this.resolveReadableGeneratedDocument(job.resultRelativePath)
        : null;
    return {
      status: job?.status ?? 'none',
      jobId: job?.id ?? null,
      error: job?.lastError ?? null,
      docxStatus: transfer?.generatedDocxStatus ?? 'not_requested',
      docxError:
        transfer?.generatedDocxStatus === 'failed'
          ? 'Generisanje Word obrasca nije uspjelo. Provjerite aktivni predložak i pokušajte ponovo.'
          : null,
      hasGeneratedDocument: Boolean(transfer?.generatedDocxPath),
      hasGeneratedPdf: Boolean(
        completedJobResult ?? this.resolveReadableGeneratedDocument(transfer?.generatedPdfPath),
      ),
    };
  }

  /** Ponovo pokreće PDF konverziju nakon 'failed' statusa (ili ako iz nekog
   * razloga nikad nije ni pokrenuta), koristeći TRENUTNI DOCX na disku. */
  async retryPdfGeneration(transferId: string, requestedByUserId?: string): Promise<void> {
    let transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      select: {
        documentWarehouseId: true,
        date: true,
        documentNumber: true,
        generatedDocxPath: true,
        generatedDocxStatus: true,
      },
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }
    if (!transfer.generatedDocxPath) {
      await this.retryDocxGeneration(transferId, requestedByUserId);
      transfer = await this.prisma.transfer.findUnique({
        where: { id: transferId },
        select: {
          documentWarehouseId: true,
          date: true,
          documentNumber: true,
          generatedDocxPath: true,
          generatedDocxStatus: true,
        },
      });
      if (transfer?.generatedDocxPath) {
        return; // DOCX generation already enqueued its PDF conversion.
      }
    }
    if (!transfer?.documentWarehouseId || !transfer.generatedDocxPath) {
      throw new BadRequestException(
        transfer?.generatedDocxStatus === 'failed'
          ? 'DOCX generisanje nije uspjelo; provjerite predložak i pokušajte ponovo.'
          : 'DOCX generisanje je još u toku.',
      );
    }
    const docxAbsolute = this.resolveReadableGeneratedDocument(transfer.generatedDocxPath);
    if (!docxAbsolute) {
      await this.retryDocxGeneration(transferId, requestedByUserId);
      return; // DOCX generation handles the corresponding PDF enqueue.
    }
    const pdfRelative = buildGeneratedPdfRelativePath(
      transfer.documentWarehouseId,
      transfer.date.getFullYear(),
      transfer.documentNumber,
    );
    await this.documentConversionQueue.enqueuePdfConversion({
      sourceType: DOCUMENT_SOURCE_TYPE_TRANSFER,
      sourceId: transferId,
      sourceFormat: 'docx',
      sourceRelativePath: transfer.generatedDocxPath,
      resultRelativePath: pdfRelative,
      requestedByUserId,
    });
  }

  async getGeneratedFileStream(
    transferId: string,
    format: 'docx' | 'pdf',
    requestedByUserId?: string,
  ): Promise<{ absolutePath: string; mime: string; filename: string }> {
    await this.ensureDocxGenerated(transferId, requestedByUserId);
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      select: {
        documentNumber: true,
        generatedDocxPath: true,
        generatedPdfPath: true,
        generatedDocxStatus: true,
      },
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }
    if (format === 'docx') {
      if (!transfer.generatedDocxPath) {
        if (transfer.generatedDocxStatus === 'queued' || transfer.generatedDocxStatus === 'running') {
          throw new HttpException(
            { status: transfer.generatedDocxStatus, message: 'Word obrazac se generiše.' },
            HttpStatus.CONFLICT,
          );
        }
        if (transfer.generatedDocxStatus === 'failed') {
          throw new BadRequestException(
            'Word obrazac nije generisan; provjerite predložak i pokrenite ponovni pokušaj.',
          );
        }
        throw new NotFoundException('Generated docx not available');
      }
      const absolutePath = this.resolveReadableGeneratedDocument(transfer.generatedDocxPath);
      if (!absolutePath) {
        throw new NotFoundException('Generated docx file not found');
      }
      return {
        absolutePath,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: `${transfer.documentNumber}.docx`,
      };
    }

    // format === 'pdf': konverzija se dešava asinhrono na Document Worker
    // servisu — ovdje samo čitamo trenutno stanje, NIKAD ne čekamo/blokiramo
    // HTTP zahtjev na LibreOffice.
    const job = await this.documentJobs.findLatestForSource(DOCUMENT_SOURCE_TYPE_TRANSFER, transferId);

    // Završeni posao može imati ispravan fajl iako je transfer pointer null
    // ili zastario (npr. completion sync nije prošao). Uvijek prvo pokušamo
    // vratiti rezultat najnovijeg posla i popraviti pointer. Bez ovoga bi
    // obrisan PDF ostavljao korisnika zauvijek na 409 sa statusom 'done'.
    if (job && job.status === 'done') {
      const resultAbsolutePath = this.resolveReadableGeneratedDocument(job.resultRelativePath);
      if (resultAbsolutePath) {
        if (transfer.generatedPdfPath !== job.resultRelativePath) {
          await this.prisma.transfer.update({
            where: { id: transferId },
            data: { generatedPdfPath: job.resultRelativePath },
          });
        }
        return {
          absolutePath: resultAbsolutePath,
          mime: 'application/pdf',
          filename: `${transfer.documentNumber}.pdf`,
        };
      }
    }

    // Ako najnoviji posao nema čitljiv rezultat, stari ali ispravan PDF je
    // i dalje bolji od prisiljavanja korisnika na novu konverziju.
    const storedPdfAbsolutePath = this.resolveReadableGeneratedDocument(transfer.generatedPdfPath);
    if (storedPdfAbsolutePath) {
      return {
        absolutePath: storedPdfAbsolutePath,
        mime: 'application/pdf',
        filename: `${transfer.documentNumber}.pdf`,
      };
    }

    if (!job || job.status === 'failed' || job.status === 'done') {
      await this.retryPdfGeneration(transferId, requestedByUserId);
      throw new HttpException(
        { status: 'processing', message: 'PDF se generiše, pokušajte ponovo za par sekundi.' },
        HttpStatus.CONFLICT,
      );
    }
    throw new HttpException(
      { status: job.status, jobId: job.id, message: 'PDF se još generiše, pokušajte ponovo za par sekundi.' },
      HttpStatus.CONFLICT,
    );
  }

  /** Osigurava da DOCX postoji na disku (generiše ga ako fali) — DOCX
   * render je sinhron/jeftin (docxtemplater, bez LibreOffice-a), pa je
   * bezbjedno raditi ga "lijeno" na download zahtjev, za razliku od PDF-a. */
  private async ensureDocxGenerated(transferId: string, requestedByUserId?: string): Promise<void> {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      select: {
        documentWarehouseId: true,
        generatedDocxPath: true,
        generatedDocxStatus: true,
      },
    });
    if (!transfer?.documentWarehouseId) {
      return;
    }
    if (this.resolveReadableGeneratedDocument(transfer.generatedDocxPath)) {
      return;
    }
    try {
      await this.retryDocxGeneration(transferId, requestedByUserId);
    } catch (error) {
      logStructuredEvent(this.logger, 'warn', {
        event: 'transfer_docx_lazy_generation_failed',
        transferId,
        error: safeErrorText(error),
      });
    }
  }

  private renderDocx(templatePath: string, data: Record<string, string>): Buffer {
    const content = readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);
    try {
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{', end: '}' },
      });
      doc.render(data);
      return doc.toBuffer() as Buffer;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nepoznata greška rendera';
      throw new BadRequestException(
        `Generisanje prenosnice nije uspjelo: ${message}. Provjerite aktivni Word obrazac skladišta.`,
      );
    }
  }
}
