import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { EmailTemplate } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_EMAIL_TEMPLATES,
  SAMPLE_TEMPLATE_VARIABLES,
  getDefaultEmailTemplate,
  type EmailTemplateDefinition,
  type EmailTemplateVariableDoc,
} from './email-template.defaults';
import type { PreviewEmailTemplateDto, UpdateEmailTemplateDto } from './dto/mail.dto';
import {
  renderEmailTemplate,
  type EmailTemplateVariables,
} from './utils/render-email-template.util';

export interface EmailTemplateResponse {
  id: string;
  key: string;
  name: string;
  description: string | null;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  variables: EmailTemplateVariableDoc[];
  enabled: boolean;
  isSystem: boolean;
  updatedAt: Date;
}

export interface RenderedEmailTemplate {
  templateId: string | null;
  subject: string;
  html: string;
  text: string;
}

const parseVariables = (raw: string): EmailTemplateVariableDoc[] => {
  try {
    const parsed = JSON.parse(raw) as EmailTemplateVariableDoc[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

@Injectable()
export class MailTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  private toResponse(row: EmailTemplate): EmailTemplateResponse {
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      subject: row.subject,
      bodyHtml: row.bodyHtml,
      bodyText: row.bodyText,
      variables: parseVariables(row.variables),
      enabled: row.enabled,
      isSystem: Boolean(getDefaultEmailTemplate(row.key)),
      updatedAt: row.updatedAt,
    };
  }

  /** Idempotentno sjeme zadanih template-a; postojeće (uređene) redove ne dira. */
  async ensureSeeded(): Promise<void> {
    for (const definition of DEFAULT_EMAIL_TEMPLATES) {
      await this.prisma.emailTemplate.upsert({
        where: { key: definition.key },
        create: {
          key: definition.key,
          name: definition.name,
          description: definition.description,
          subject: definition.subject,
          bodyHtml: definition.bodyHtml,
          bodyText: definition.bodyText,
          variables: JSON.stringify(definition.variables),
        },
        update: {},
      });
    }
  }

  async listTemplates(): Promise<EmailTemplateResponse[]> {
    await this.ensureSeeded();
    const rows = await this.prisma.emailTemplate.findMany({ orderBy: { key: 'asc' } });
    return rows.map((row) => this.toResponse(row));
  }

  async getTemplate(key: string): Promise<EmailTemplateResponse> {
    await this.ensureSeeded();
    const row = await this.prisma.emailTemplate.findUnique({ where: { key } });
    if (!row) {
      throw new NotFoundException(`Email template "${key}" nije pronađen.`);
    }
    return this.toResponse(row);
  }

  async updateTemplate(key: string, dto: UpdateEmailTemplateDto): Promise<EmailTemplateResponse> {
    await this.getTemplate(key);
    const row = await this.prisma.emailTemplate.update({
      where: { key },
      data: {
        name: dto.name,
        description: dto.description ?? null,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        bodyText: dto.bodyText,
        enabled: dto.enabled,
      },
    });
    return this.toResponse(row);
  }

  async resetTemplate(key: string): Promise<EmailTemplateResponse> {
    const definition = getDefaultEmailTemplate(key);
    if (!definition) {
      throw new BadRequestException(`Template "${key}" nema zadanu (default) verziju.`);
    }
    await this.ensureSeeded();
    const row = await this.prisma.emailTemplate.update({
      where: { key },
      data: {
        name: definition.name,
        description: definition.description,
        subject: definition.subject,
        bodyHtml: definition.bodyHtml,
        bodyText: definition.bodyText,
        variables: JSON.stringify(definition.variables),
        enabled: true,
      },
    });
    return this.toResponse(row);
  }

  /** Pregled sa oglednim podacima; prihvaća i nepohranjeni sadržaj iz editora. */
  async previewTemplate(
    key: string,
    dto: PreviewEmailTemplateDto,
  ): Promise<{ subject: string; html: string; text: string }> {
    const current = await this.getTemplate(key);
    const variables: EmailTemplateVariables = { ...SAMPLE_TEMPLATE_VARIABLES };
    return {
      subject: renderEmailTemplate(dto.subject ?? current.subject, variables, 'text'),
      html: renderEmailTemplate(dto.bodyHtml ?? current.bodyHtml, variables, 'html'),
      text: renderEmailTemplate(dto.bodyText ?? current.bodyText, variables, 'text'),
    };
  }

  /** Render za stvarno slanje. Baci grešku ako template nedostaje/isključen je. */
  async renderForSending(
    key: string,
    variables: EmailTemplateVariables,
  ): Promise<RenderedEmailTemplate> {
    await this.ensureSeeded();
    const row = await this.prisma.emailTemplate.findUnique({ where: { key } });
    const definition: EmailTemplateDefinition | undefined = getDefaultEmailTemplate(key);
    if (!row && !definition) {
      throw new NotFoundException(`Email template "${key}" nije pronađen.`);
    }
    if (row && !row.enabled) {
      throw new BadRequestException(
        `Email template "${key}" je isključen u postavkama e-pošte.`,
      );
    }
    const subject = row?.subject ?? definition!.subject;
    const bodyHtml = row?.bodyHtml ?? definition!.bodyHtml;
    const bodyText = row?.bodyText ?? definition!.bodyText;
    return {
      templateId: row?.id ?? null,
      subject: renderEmailTemplate(subject, variables, 'text'),
      html: renderEmailTemplate(bodyHtml, variables, 'html'),
      text: renderEmailTemplate(bodyText, variables, 'text'),
    };
  }
}
