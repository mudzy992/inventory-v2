import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { ModeratorScopeService } from '../../common/services/moderator-scope.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { assertTransferTemplateValid } from './utils/validate-transfer-template.util';
import { resolveTransferTemplatePath } from './utils/resolve-transfer-template-path.util';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

@Injectable()
export class WarehouseTransferTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly moderatorScope: ModeratorScopeService,
  ) {}

  async listTemplates(user: AuthenticatedUser, warehouseId: string) {
    await this.assertTemplateAccess(user, warehouseId);
    return this.prisma.warehouseTransferTemplate.findMany({
      where: { warehouseId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        isActive: true,
        createdAt: true,
        uploadedBy: { select: { id: true, username: true } },
      },
    });
  }

  async getActiveTemplate(warehouseId: string) {
    return this.prisma.warehouseTransferTemplate.findFirst({
      where: { warehouseId, isActive: true },
      select: {
        id: true,
        label: true,
        templatePath: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async uploadTemplate(
    user: AuthenticatedUser,
    warehouseId: string,
    file: Express.Multer.File,
    label: string,
  ) {
    await this.assertTemplateAccess(user, warehouseId);
    await this.assertWarehouseForTemplate(warehouseId);
    if (!file) {
      throw new BadRequestException('File is required');
    }
    const extension = extname(file.originalname).toLowerCase();
    if (extension !== '.docx' || file.mimetype !== DOCX_MIME) {
      throw new BadRequestException('Template must be a .docx Word document');
    }
    const envMaxMb = Number(this.configService.get<string>('MAX_UPLOAD_MB', '10'));
    const maxMb = await this.settingsService.getNumberValue('upload.max_mb', envMaxMb);
    if (file.size > maxMb * 1024 * 1024) {
      throw new BadRequestException(`File exceeds ${maxMb} MB limit`);
    }
    assertTransferTemplateValid(file.buffer);
    const templateId = crypto.randomUUID();
    const relativePath = join(
      'templates',
      'warehouses',
      warehouseId,
      `${templateId}.docx`,
    ).replace(/\\/g, '/');
    const absolutePath = join(this.getUploadRoot(), relativePath);
    mkdirSync(resolve(absolutePath, '..'), { recursive: true });
    writeFileSync(absolutePath, file.buffer);
    const trimmedLabel = label.trim() || `Obrazac ${new Date().toISOString().slice(0, 10)}`;
    await this.prisma.$transaction([
      this.prisma.warehouseTransferTemplate.updateMany({
        where: { warehouseId, isActive: true },
        data: { isActive: false },
      }),
      this.prisma.warehouseTransferTemplate.create({
        data: {
          id: templateId,
          warehouseId,
          label: trimmedLabel,
          templatePath: relativePath,
          isActive: true,
          uploadedByUserId: user.id,
        },
      }),
    ]);
    return this.getActiveTemplate(warehouseId);
  }

  async downloadTemplate(
    user: AuthenticatedUser,
    warehouseId: string,
    templateId: string,
  ): Promise<StreamableFile> {
    await this.assertTemplateAccess(user, warehouseId);
    await this.assertWarehouseForTemplate(warehouseId);
    const template = await this.prisma.warehouseTransferTemplate.findFirst({
      where: { id: templateId, warehouseId },
      select: { label: true, templatePath: true },
    });
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    const absolutePath = this.resolveTemplateAbsolutePath(template.templatePath);
    if (!existsSync(absolutePath)) {
      throw new NotFoundException('Template file not found');
    }
    const safeLabel = template.label.replace(/[^\w\s-]/g, '').trim() || 'obrazac';
    const stream = createReadStream(absolutePath);
    return new StreamableFile(stream, {
      type: DOCX_MIME,
      disposition: `attachment; filename="${safeLabel}.docx"`,
    });
  }

  async activateTemplate(user: AuthenticatedUser, warehouseId: string, templateId: string) {
    await this.assertTemplateAccess(user, warehouseId);
    await this.assertWarehouseForTemplate(warehouseId);
    const template = await this.prisma.warehouseTransferTemplate.findFirst({
      where: { id: templateId, warehouseId },
    });
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    const absolutePath = this.resolveTemplateAbsolutePath(template.templatePath);
    if (!existsSync(absolutePath)) {
      throw new NotFoundException('Template file not found');
    }
    assertTransferTemplateValid(readFileSync(absolutePath));
    await this.prisma.$transaction([
      this.prisma.warehouseTransferTemplate.updateMany({
        where: { warehouseId, isActive: true },
        data: { isActive: false },
      }),
      this.prisma.warehouseTransferTemplate.update({
        where: { id: templateId },
        data: { isActive: true },
      }),
    ]);
    return this.getActiveTemplate(warehouseId);
  }

  private async assertTemplateAccess(user: AuthenticatedUser, warehouseId: string): Promise<void> {
    if (user.role === 'admin') {
      return;
    }
    if (user.role === 'moderator') {
      await this.moderatorScope.assertWarehouseAssigned(user, warehouseId);
      return;
    }
    throw new ForbiddenException('Nemate dozvolu za upravljanje obrascem prenosnice');
  }

  private async assertWarehouseForTemplate(warehouseId: string): Promise<void> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { orgUnitId: true, isActive: true },
    });
    if (!warehouse?.isActive) {
      throw new NotFoundException('Warehouse not found');
    }
    if (!warehouse.orgUnitId) {
      throw new BadRequestException(
        'Skladište mora imati org. jedinicu prije uploada obrasca prenosnice',
      );
    }
  }

  getUploadRoot(): string {
    return this.configService.get<string>('UPLOAD_DIR', join(process.cwd(), 'uploads'));
  }

  resolveTemplateAbsolutePath(templatePath: string): string {
    return resolveTransferTemplatePath(this.getUploadRoot(), templatePath);
  }

  async assertWarehouseHasActiveTemplate(warehouseId: string): Promise<void> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { name: true, isActive: true },
    });
    if (!warehouse?.isActive) {
      throw new BadRequestException('Skladište nije pronađeno ili nije aktivno');
    }
    const template = await this.getActiveTemplate(warehouseId);
    if (!template) {
      throw new BadRequestException(
        `Skladište „${warehouse.name}” nema aktivni obrazac prenosnice — uploadujte .docx u Kontekst skladišta.`,
      );
    }
    const absolutePath = this.resolveTemplateAbsolutePath(template.templatePath);
    if (!existsSync(absolutePath)) {
      throw new BadRequestException(
        `Aktivni obrazac prenosnice za skladište „${warehouse.name}” nije pronađen na disku — uploadujte ponovo.`,
      );
    }
  }
}
