import { BadRequestException, Injectable, HttpException, HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import Docxtemplater from 'docxtemplater';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
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

@Injectable()
export class TransferDocumentGenerationService {
  private readonly logger = new Logger(TransferDocumentGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly templateService: WarehouseTransferTemplateService,
    private readonly documentConversionQueue: DocumentConversionQueueService,
    private readonly documentJobs: DocumentJobsService,
  ) {}

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
    const docxAbsolute = join(this.templateService.getUploadRoot(), docxRelative);
    mkdirSync(resolve(docxAbsolute, '..'), { recursive: true });
    writeFileSync(docxAbsolute, docxBuffer);

    // PDF konverzija se resetuje na svaki novi DOCX (npr. transfer je
    // ponovo potpisan sa izmijenjenim podacima) — stari generatedPdfPath
    // više ne odgovara trenutnom DOCX-u, brišemo ga dok novi posao ne
    // završi (getGeneratedFileStream i frontend to tretiraju kao
    // "generiše se").
    await this.prisma.transfer.update({
      where: { id: transferId },
      data: { generatedDocxPath: docxRelative, generatedPdfPath: null },
    });

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
      try {
        await this.documentConversionQueue.enqueuePdfConversion({
          sourceType: DOCUMENT_SOURCE_TYPE_TRANSFER,
          sourceId: transferId,
          sourceFormat: 'docx',
          sourceRelativePath: docxRelative,
          resultRelativePath: pdfRelative,
          requestedByUserId,
        });
      } catch (err) {
        // DOCX (obavezan dokument) je već uspješno sačuvan iznad — PDF je
        // "nice to have" asinhroni dodatak. Prolazni Redis problem OVDJE
        // NE SMIJE srušiti kreiranje/potpisivanje prenosnice (kritičnu
        // poslovnu transakciju); enqueuePdfConversion je sam po sebi već
        // označio DocumentJob red kao 'failed' ako je uspio da ga kreira
        // prije pada — korisnik može ručno pokrenuti
        // POST :id/generated-document/retry.
        this.logger.warn(
          `PDF enqueue failed for transfer ${transferId} (DOCX already saved, continuing): ${String(err)}`,
        );
      }
    }
  }

  /**
   * Status trenutnog/posljednjeg PDF posla za prenosnicu — koristi ga
   * frontend za polling dok čeka Socket.IO `document.job.updated` event
   * (ili kao fallback ako WebSocket nije povezan).
   */
  async getPdfJobStatus(transferId: string): Promise<{
    status: 'none' | 'queued' | 'running' | 'done' | 'failed';
    jobId: string | null;
    error: string | null;
  }> {
    const job = await this.documentJobs.findLatestForSource(DOCUMENT_SOURCE_TYPE_TRANSFER, transferId);
    if (!job) {
      return { status: 'none', jobId: null, error: null };
    }
    return { status: job.status, jobId: job.id, error: job.lastError };
  }

  /** Ponovo pokreće PDF konverziju nakon 'failed' statusa (ili ako iz nekog
   * razloga nikad nije ni pokrenuta), koristeći TRENUTNI DOCX na disku. */
  async retryPdfGeneration(transferId: string, requestedByUserId?: string): Promise<void> {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      select: {
        documentWarehouseId: true,
        date: true,
        documentNumber: true,
        generatedDocxPath: true,
      },
    });
    if (!transfer?.documentWarehouseId || !transfer.generatedDocxPath) {
      throw new BadRequestException('Prenosnica nema generisan DOCX — prvo ga generišite.');
    }
    const docxAbsolute = join(this.templateService.getUploadRoot(), transfer.generatedDocxPath);
    if (!existsSync(docxAbsolute)) {
      throw new NotFoundException('Generisani DOCX fajl nije pronađen na disku');
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
      },
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }
    if (format === 'docx') {
      if (!transfer.generatedDocxPath) {
        throw new NotFoundException('Generated docx not available');
      }
      const absolutePath = join(this.templateService.getUploadRoot(), transfer.generatedDocxPath);
      if (!existsSync(absolutePath)) {
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
    if (transfer.generatedPdfPath) {
      const absolutePath = join(this.templateService.getUploadRoot(), transfer.generatedPdfPath);
      if (existsSync(absolutePath)) {
        return { absolutePath, mime: 'application/pdf', filename: `${transfer.documentNumber}.pdf` };
      }
      // DB kaže da postoji ali fajl nedostaje (npr. obrisan sa diska) —
      // tretiramo kao da PDF nikad nije generisan i ponovo pokrećemo ispod.
    }
    const job = await this.documentJobs.findLatestForSource(DOCUMENT_SOURCE_TYPE_TRANSFER, transferId);
    if (!job || job.status === 'failed') {
      await this.retryPdfGeneration(transferId, requestedByUserId);
      throw new HttpException(
        { status: 'processing', message: 'PDF se generiše, pokušajte ponovo za par sekundi.' },
        HttpStatus.CONFLICT,
      );
    }
    if (job.status === 'done' && !transfer.generatedPdfPath) {
        await this.prisma.transfer.update({
            where: { id: transferId },
            data: {
            generatedPdfPath: job.resultRelativePath,
            },
        });

        const absolutePath = join(
            this.templateService.getUploadRoot(),
            job.resultRelativePath,
        );

        if (existsSync(absolutePath)) {
            return {
            absolutePath,
            mime: 'application/pdf',
            filename: `${transfer.documentNumber}.pdf`,
            };
        }
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
      select: { documentWarehouseId: true, generatedDocxPath: true },
    });
    if (!transfer?.documentWarehouseId) {
      return;
    }
    const docxAbsolute = transfer.generatedDocxPath
      ? join(this.templateService.getUploadRoot(), transfer.generatedDocxPath)
      : null;
    if (docxAbsolute && existsSync(docxAbsolute)) {
      return;
    }
    try {
      await this.generateForTransfer(transferId, requestedByUserId);
    } catch {
      // ostavi getGeneratedFileStream da baci odgovarajući NotFound/Conflict
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
