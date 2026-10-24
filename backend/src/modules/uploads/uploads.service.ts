import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { hasPdfSignature } from '../../common/utils/file-signature.util';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { buildSignedPdfRelativePath } from '../transfers/utils/transfer-document-path.util';
import { TransfersService } from '../transfers/transfers.service';

const SIGNED_TRANSFER_MIME_TYPES = new Set(['application/pdf']);

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly transfersService: TransfersService,
    private readonly settingsService: SettingsService,
  ) {}

  async uploadTransferDocument(
    user: AuthenticatedUser,
    transferId: string,
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (!SIGNED_TRANSFER_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Potpisana prenosnica mora biti PDF');
    }
    if (!file.buffer || !hasPdfSignature(file.buffer)) {
      throw new BadRequestException('Sadržaj datoteke nije validan PDF');
    }
    const envMaxMb = Number(this.configService.get<string>('MAX_UPLOAD_MB', '10'));
    const maxMb = await this.settingsService.getNumberValue('upload.max_mb', envMaxMb);
    const maxBytes = maxMb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException(`File exceeds ${maxMb} MB limit`);
    }
    const transfer = await this.transfersService.findOne(user, transferId);
    if (!transfer.documentWarehouseId) {
      throw new BadRequestException('Transfer has no document warehouse configured');
    }
    const year = transfer.date.getFullYear();
    const uploadId = randomUUID();
    const relativePath = buildSignedPdfRelativePath(
      transfer.documentWarehouseId,
      year,
      transfer.documentNumber,
      uploadId,
    );
    const absolutePath = join(this.getUploadRoot(), relativePath);
    const temporaryPath = `${absolutePath}.${uploadId}.tmp`;
    const normalizedPath = relativePath.replace(/\\/g, '/');
    mkdirSync(resolve(absolutePath, '..'), { recursive: true });

    let promoted = false;
    try {
      writeFileSync(temporaryPath, file.buffer, { flag: 'wx', mode: 0o600 });
      renameSync(temporaryPath, absolutePath);
      promoted = true;

      return await this.prisma.$transaction(async (tx) => {
        const upload = await tx.upload.create({
          data: {
            path: normalizedPath,
            mime: file.mimetype,
            sizeBytes: file.size,
            entityType: 'transfer',
            entityId: transferId,
          },
        });
        await tx.transfer.update({
          where: { id: transferId },
          data: { scannedDocUrl: normalizedPath },
        });
        await this.transfersService.markUploadedAfterScan(transferId, tx);
        return upload;
      });
    } catch (error) {
      for (const path of [temporaryPath, ...(promoted ? [absolutePath] : [])]) {
        try {
          rmSync(path, { force: true });
        } catch (cleanupError) {
          this.logger.error(
            `Failed to clean up an incomplete transfer upload: ${String(cleanupError)}`,
          );
        }
      }
      throw error;
    }
  }

  async getFileStream(user: AuthenticatedUser, uploadId: string): Promise<StreamableFile> {
    const upload = await this.prisma.upload.findUnique({ where: { id: uploadId } });
    if (!upload) {
      throw new NotFoundException('Upload not found');
    }
    if (upload.entityType === 'transfer' && upload.entityId) {
      await this.transfersService.findOne(user, upload.entityId);
    }
    const absolutePath = join(this.getUploadRoot(), upload.path);
    if (!existsSync(absolutePath)) {
      throw new NotFoundException('File not found on disk');
    }
    const stream = createReadStream(absolutePath);
    const filename = upload.path.split('/').pop() ?? `upload-${upload.id}`;
    return new StreamableFile(stream, {
      type: upload.mime,
      disposition: `attachment; filename="${filename}"`,
    });
  }

  async findByEntity(user: AuthenticatedUser, entityType: string, entityId: string) {
    if (entityType === 'transfer') {
      await this.transfersService.findOne(user, entityId);
    }
    return this.prisma.upload.findMany({
      where: { entityType: entityType as 'transfer', entityId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, mime: true, path: true, sizeBytes: true, createdAt: true },
    });
  }

  private getUploadRoot(): string {
    return this.configService.get<string>('UPLOAD_DIR', join(process.cwd(), 'uploads'));
  }
}
