import {
  BadRequestException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { TransfersService } from '../transfers/transfers.service';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

@Injectable()
export class UploadsService {
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
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Unsupported file type');
    }
    const envMaxMb = Number(this.configService.get<string>('MAX_UPLOAD_MB', '10'));
    const maxMb = await this.settingsService.getNumberValue('upload.max_mb', envMaxMb);
    const maxBytes = maxMb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException(`File exceeds ${maxMb} MB limit`);
    }
    await this.transfersService.findOne(user, transferId);
    const year = new Date().getFullYear();
    const extension = extname(file.originalname) || this.extensionFromMime(file.mimetype);
    const relativePath = join('transfers', String(year), `${transferId}${extension}`);
    const absolutePath = join(this.getUploadRoot(), relativePath);
    mkdirSync(resolve(absolutePath, '..'), { recursive: true });
    writeFileSync(absolutePath, file.buffer);
    const normalizedPath = relativePath.replace(/\\/g, '/');
    const upload = await this.prisma.upload.create({
      data: {
        path: normalizedPath,
        mime: file.mimetype,
        sizeBytes: file.size,
        entityType: 'transfer',
        entityId: transferId,
      },
    });
    await this.prisma.transfer.update({
      where: { id: transferId },
      data: { scannedDocUrl: normalizedPath },
    });
    await this.transfersService.markUploadedAfterScan(transferId);
    return upload;
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

  private extensionFromMime(mime: string): string {
    if (mime === 'application/pdf') {
      return '.pdf';
    }
    if (mime === 'image/png') {
      return '.png';
    }
    if (mime === 'image/webp') {
      return '.webp';
    }
    return '.jpg';
  }
}
