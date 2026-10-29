import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  parseCategoryFields,
  resolveSerialNumberFromSpecifications,
} from '../../common/utils/category-fields.util';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { TransferDocumentGenerationService } from '../transfers/transfer-document-generation.service';
import { TransfersService } from '../transfers/transfers.service';
import { buildTransferEquipmentLabel } from '../transfers/utils/build-transfer-equipment-label.util';
import { buildTransferTemplateData } from '../transfers/utils/build-transfer-template-data.util';
import type { SendTransferEmailDto } from './dto/mail.dto';
import { MailService, type MailAttachmentInput } from './mail.service';

const formatDate = (date: Date): string => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${date.getFullYear()}.`;
};

@Injectable()
export class TransferMailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transfersService: TransfersService,
    private readonly documentGeneration: TransferDocumentGenerationService,
    private readonly mailService: MailService,
  ) {}

  /** Prenosnica kao prilog: prvo generisani PDF; ako konverzija još nije
   * gotova, DOCX obrazac — email ne smije čekati LibreOffice worker. */
  private async resolvePrenosnicaAttachment(
    transferId: string,
    userId: string,
  ): Promise<MailAttachmentInput> {
    try {
      const pdf = await this.documentGeneration.getGeneratedFileStream(
        transferId,
        'pdf',
        userId,
      );
      return { filename: pdf.filename, path: pdf.absolutePath, contentType: pdf.mime };
    } catch {
      // PDF nije spreman — probaj DOCX ispod.
    }
    try {
      const docx = await this.documentGeneration.getGeneratedFileStream(
        transferId,
        'docx',
        userId,
      );
      return { filename: docx.filename, path: docx.absolutePath, contentType: docx.mime };
    } catch {
      throw new BadRequestException(
        'Prenosnica još nije generisana. Otvorite dokument prenosnice i pokušajte ponovo za nekoliko trenutaka.',
      );
    }
  }

  async sendTransferCompletedEmail(
    user: AuthenticatedUser,
    transferId: string,
    dto: SendTransferEmailDto,
  ) {
    // Isti scope pristup kao i preuzimanje dokumenta prenosnice.
    await this.transfersService.findOne(user, transferId);

    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: {
        signer: true,
        fromPerson: true,
        toPerson: true,
        fromWarehouse: true,
        toWarehouse: true,
        equipment: {
          include: {
            category: true,
            stockLot: { select: { productName: true } },
          },
        },
      },
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }
    if (transfer.status === 'cancelled') {
      throw new BadRequestException('Otkazana prenosnica se ne može poslati emailom.');
    }

    const attachment = await this.resolvePrenosnicaAttachment(transferId, user.id);
    const branding = await this.mailService.getBrandingVariables();
    const templateData = buildTransferTemplateData(transfer);
    const serialNumber = resolveSerialNumberFromSpecifications(
      parseCategoryFields(transfer.equipment.category.fields),
      parseCategoryFields(transfer.equipment.category.optionalFields),
      (transfer.equipment.specifications ?? {}) as Record<string, string>,
    );

    const log = await this.mailService.sendTemplateMail({
      templateKey: 'transfer.completed',
      to: dto.to,
      cc: dto.cc,
      bcc: dto.bcc,
      variables: {
        ...branding,
        documentNumber: transfer.documentNumber,
        equipmentName:
          transfer.equipment.stockLot?.productName?.trim() ||
          buildTransferEquipmentLabel(transfer.equipment),
        inventoryNumber: transfer.equipment.inventoryNumber ?? '—',
        serialNumber: serialNumber ?? '—',
        categoryName: transfer.equipment.category.name,
        fromLabel: templateData.predao,
        toLabel: templateData.preuzeo,
        signerName: templateData.potpisnik,
        date: formatDate(transfer.date),
        reason: transfer.reason?.trim() || '—',
      },
      attachments: [attachment],
      transferId,
      sentByUserId: user.id,
    });

    return {
      id: log.id,
      status: log.status,
      to: log.toAddresses,
      subject: log.subject,
      attachment: attachment.filename,
      sentAt: log.createdAt,
    };
  }
}
