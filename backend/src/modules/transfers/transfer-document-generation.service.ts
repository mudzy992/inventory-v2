import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import Docxtemplater from 'docxtemplater';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import PizZip from 'pizzip';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { WarehouseTransferTemplateService } from '../warehouses/warehouse-transfer-template.service';
import { buildTransferTemplateData } from './utils/build-transfer-template-data.util';
import {
  buildGeneratedDocxRelativePath,
  buildGeneratedPdfRelativePath,
} from './utils/transfer-document-path.util';
import {
  convertDocxToPdf,
} from './utils/docx-to-pdf.util';

const transferTemplateInclude = {
  signer: true,
  fromPerson: true,
  toPerson: true,
  fromWarehouse: true,
  toWarehouse: true,
  equipment: { include: { category: true, stockLot: { select: { productName: true } } } },
} satisfies Prisma.TransferInclude;

@Injectable()
export class TransferDocumentGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly templateService: WarehouseTransferTemplateService,
  ) {}

  async generateForTransfer(transferId: string): Promise<void> {
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
    let pdfRelative: string | null = null;
    const generatePdf = await this.settingsService.getBooleanValue(
      'transfer.generate_print_pdf',
      true,
    );
    if (generatePdf) {
      const outDir = resolve(docxAbsolute, '..');
      const convertedPdf = await convertDocxToPdf(docxAbsolute, outDir);
      if (convertedPdf) {
        pdfRelative = buildGeneratedPdfRelativePath(
          transfer.documentWarehouseId,
          year,
          transfer.documentNumber,
        );
        const pdfAbsolute = join(this.templateService.getUploadRoot(), pdfRelative);
        if (convertedPdf !== pdfAbsolute) {
          writeFileSync(pdfAbsolute, readFileSync(convertedPdf));
        }
      }
    }
    await this.prisma.transfer.update({
      where: { id: transferId },
      data: {
        generatedDocxPath: docxRelative,
        generatedPdfPath: pdfRelative,
      },
    });
  }

  async getGeneratedFileStream(
    transferId: string,
    format: 'docx' | 'pdf',
  ): Promise<{ absolutePath: string; mime: string; filename: string }> {
    let transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      select: {
        documentNumber: true,
        documentWarehouseId: true,
        date: true,
        generatedDocxPath: true,
        generatedPdfPath: true,
      },
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }
    if (
      format === 'pdf' &&
      !transfer.generatedPdfPath &&
      transfer.generatedDocxPath &&
      transfer.documentWarehouseId
    ) {
      const generatePdf = await this.settingsService.getBooleanValue(
        'transfer.generate_print_pdf',
        true,
      );
      if (generatePdf && transfer.generatedDocxPath && transfer.documentWarehouseId) {
        await this.ensurePdfFromExistingDocx(transferId, {
          documentNumber: transfer.documentNumber,
          documentWarehouseId: transfer.documentWarehouseId,
          date: transfer.date,
          generatedDocxPath: transfer.generatedDocxPath,
        });
        transfer = await this.prisma.transfer.findUnique({
          where: { id: transferId },
          select: {
            documentNumber: true,
            documentWarehouseId: true,
            date: true,
            generatedDocxPath: true,
            generatedPdfPath: true,
          },
        });
      }
    }
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }
    const relativePath = format === 'pdf' ? transfer.generatedPdfPath : transfer.generatedDocxPath;
    if (!relativePath) {
      throw new NotFoundException(`Generated ${format} not available`);
    }
    const absolutePath = join(this.templateService.getUploadRoot(), relativePath);
    if (!existsSync(absolutePath)) {
      throw new NotFoundException(`Generated ${format} file not found`);
    }
    const mime =
      format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const filename = `${transfer.documentNumber}.${format}`;
    return { absolutePath, mime, filename };
  }

  private async ensurePdfFromExistingDocx(
    transferId: string,
    transfer: {
      documentNumber: string;
      documentWarehouseId: string;
      date: Date;
      generatedDocxPath: string;
    },
  ): Promise<void> {
    const docxAbsolute = join(this.templateService.getUploadRoot(), transfer.generatedDocxPath);
    if (!existsSync(docxAbsolute)) {
      return;
    }
    const outDir = resolve(docxAbsolute, '..');
    const convertedPdf = await convertDocxToPdf(docxAbsolute, outDir);
    if (!convertedPdf) {
      return;
    }
    const pdfRelative = buildGeneratedPdfRelativePath(
      transfer.documentWarehouseId,
      transfer.date.getFullYear(),
      transfer.documentNumber,
    );
    const pdfAbsolute = join(this.templateService.getUploadRoot(), pdfRelative);
    if (convertedPdf !== pdfAbsolute) {
      writeFileSync(pdfAbsolute, readFileSync(convertedPdf));
    }
    await this.prisma.transfer.update({
      where: { id: transferId },
      data: { generatedPdfPath: pdfRelative },
    });
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
