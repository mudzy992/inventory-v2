import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import {
  recordUploadReject,
  type UploadRejectDetails,
  type UploadRejectReason,
} from '../../common/upload/upload-reject.registry';
import { hasPdfSignature } from '../../common/utils/file-signature.util';
import { redactSensitiveText } from '../../common/utils/redact-log.util';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { buildSignedPdfRelativePath } from '../transfers/utils/transfer-document-path.util';
import { TransfersService } from '../transfers/transfers.service';
import {
  requireAuthorizableStoredUpload,
  requireReadableUploadEntityType,
  resolveUploadAbsolutePath,
  type UploadReadableEntityType,
} from './upload-access-policy.util';

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

  private rejectUpload(
    reason: UploadRejectReason,
    message: string,
    details?: UploadRejectDetails,
  ): never {
    recordUploadReject({
      operation: 'signed_transfer_pdf',
      reason,
      ...(details ? { details } : {}),
    });
    throw new BadRequestException(message);
  }

  async uploadTransferDocument(
    user: AuthenticatedUser,
    transferId: string,
    file: Express.Multer.File,
  ) {
    if (!file) {
      this.rejectUpload('missing_file', 'File is required');
    }
    if (!SIGNED_TRANSFER_MIME_TYPES.has(file.mimetype)) {
      this.rejectUpload('invalid_mime', 'Potpisana prenosnica mora biti PDF', {
        declaredMime: file.mimetype.slice(0, 100),
      });
    }
    if (!file.buffer || !hasPdfSignature(file.buffer)) {
      this.rejectUpload('invalid_signature', 'Sadržaj datoteke nije validan PDF');
    }
    const envMaxMb = Number(this.configService.get<string>('MAX_UPLOAD_MB', '10'));
    const maxMb = await this.settingsService.getNumberValue('upload.max_mb', envMaxMb);
    const maxBytes = maxMb * 1024 * 1024;
    if (file.size > maxBytes) {
      this.rejectUpload('size_limit', `File exceeds ${maxMb} MB limit`, {
        sizeBytes: Number.isFinite(file.size) ? file.size : null,
        maxBytes,
      });
    }
    const transfer = await this.transfersService.findOne(user, transferId);
    if (!transfer.documentWarehouseId) {
      this.rejectUpload(
        'missing_document_warehouse',
        'Transfer has no document warehouse configured',
      );
    }
    const year = transfer.date.getFullYear();
    const uploadId = randomUUID();
    const relativePath = buildSignedPdfRelativePath(
      transfer.documentWarehouseId,
      year,
      transfer.documentNumber,
      uploadId,
    );
    const absolutePath = resolveUploadAbsolutePath(this.getUploadRoot(), relativePath);
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
            JSON.stringify({
              event: 'upload_cleanup_failed',
              operation: 'signed_transfer_pdf',
              error: redactSensitiveText(
                cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
              ),
            }),
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
    const { type, entityId } = requireAuthorizableStoredUpload(upload.entityType, upload.entityId);
    await this.authorizeUploadRead(type, user, entityId);
    const absolutePath = resolveUploadAbsolutePath(this.getUploadRoot(), upload.path);
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
    // DTO validates at the boundary; this keeps direct/internal callers safe.
    const type = requireReadableUploadEntityType(entityType);
    await this.authorizeUploadRead(type, user, entityId);
    return this.prisma.upload.findMany({
      where: { entityType: type, entityId },
      orderBy: { createdAt: 'desc' },
      // `path` is an internal storage detail and must not be published.
      select: { id: true, mime: true, sizeBytes: true, createdAt: true },
    });
  }

  /**
   * Exhaustive switch: adding a value to UPLOAD_READABLE_ENTITY_TYPES without
   * adding its authorizer is a compile error (the `never` branch).
   */
  private async authorizeUploadRead(
    type: UploadReadableEntityType,
    user: AuthenticatedUser,
    entityId: string,
  ): Promise<void> {
    switch (type) {
      case 'transfer':
        await this.transfersService.findOne(user, entityId);
        return;
      default: {
        const exhaustive: never = type;
        throw new ForbiddenException(`No upload read authorizer for ${String(exhaustive)}`);
      }
    }
  }

  private getUploadRoot(): string {
    return this.configService.get<string>('UPLOAD_DIR', join(process.cwd(), 'uploads'));
  }
}
