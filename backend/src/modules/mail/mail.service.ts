import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { createTransport, type Transporter } from 'nodemailer';
import type { EmailLog } from '../../../generated/prisma/client';
import { logStructuredEvent, safeErrorText } from '../../common/logging/structured-event.logger';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { MailConfigService, type ResolvedMailConfig } from './mail-config.service';
import { MailTemplatesService } from './mail-templates.service';
import {
  findInvalidEmailAddress,
  parseEmailAddressList,
} from './utils/email-address.util';
import type { EmailTemplateVariables } from './utils/render-email-template.util';

export interface MailAttachmentInput {
  filename: string;
  /** Ako je zadano `path`, sadržaj se čita s diska; inače se koristi `content`. */
  path?: string;
  content?: Buffer;
  contentType?: string;
}

export interface SendTemplateMailInput {
  templateKey: string;
  /** String sa zarezima ili gotova lista adresa. */
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  variables: EmailTemplateVariables;
  attachments?: MailAttachmentInput[];
  transferId?: string;
  sentByUserId?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly configService: MailConfigService,
    private readonly templatesService: MailTemplatesService,
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  private createTransporter(config: ResolvedMailConfig): Transporter {
    return createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.username, pass: config.password },
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  /** appName/companyName iz postojećih postavki aplikacije (branding/company). */
  async getBrandingVariables(): Promise<{ appName: string; companyName: string }> {
    const [appRow, companyRow] = await Promise.all([
      this.settingsService.getRow('app.name'),
      this.settingsService.getRow('company.name'),
    ]);
    return {
      appName: appRow?.value?.trim() || 'Evidens',
      companyName: companyRow?.value?.trim() || '',
    };
  }

  async testConnection(): Promise<{ ok: true; message: string }> {
    const config = await this.configService.resolveForSending();
    const transporter = this.createTransporter(config);
    try {
      await transporter.verify();
    } catch (error) {
      throw new BadRequestException(
        `Povezivanje na SMTP server nije uspjelo: ${safeErrorText(error)}`,
      );
    } finally {
      transporter.close();
    }
    return {
      ok: true,
      message: `Veza na ${config.host}:${config.port} je uspješna.`,
    };
  }

  async sendTestEmail(to: string, sentByUserId: string): Promise<EmailLog> {
    const config = await this.configService.resolveForSending();
    const branding = await this.getBrandingVariables();
    return this.sendTemplateMail({
      templateKey: 'system.test',
      to,
      variables: {
        ...branding,
        smtpProvider: config.provider,
        testRecipient: to,
      },
      sentByUserId,
    });
  }

  async sendTemplateMail(input: SendTemplateMailInput): Promise<EmailLog> {
    const to = parseEmailAddressList(Array.isArray(input.to) ? input.to.join(',') : input.to);
    const cc = parseEmailAddressList(Array.isArray(input.cc) ? input.cc.join(',') : input.cc);
    const bcc = parseEmailAddressList(
      Array.isArray(input.bcc) ? input.bcc.join(',') : input.bcc,
    );
    if (to.length === 0) {
      throw new BadRequestException('Unesite barem jednu email adresu primaoca (Polje „Za").');
    }
    const invalid = findInvalidEmailAddress([...to, ...cc, ...bcc]);
    if (invalid) {
      throw new BadRequestException(`Email adresa "${invalid}" nije ispravna.`);
    }

    const config = await this.configService.resolveForSending();
    const rendered = await this.templatesService.renderForSending(
      input.templateKey,
      input.variables,
    );

    const attachments = await Promise.all(
      (input.attachments ?? []).map(async (attachment) => ({
        filename: attachment.filename,
        content: attachment.content ?? (await readFile(attachment.path!)),
        contentType: attachment.contentType,
      })),
    );

    const transporter = this.createTransporter(config);
    try {
      await transporter.sendMail({
        from: config.fromName
          ? `"${config.fromName.replace(/"/g, '')}" <${config.fromEmail}>`
          : config.fromEmail,
        to,
        cc: cc.length > 0 ? cc : undefined,
        bcc: bcc.length > 0 ? bcc : undefined,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        attachments,
      });
    } catch (error) {
      const message = safeErrorText(error);
      await this.prisma.emailLog.create({
        data: {
          templateKey: input.templateKey,
          templateId: rendered.templateId,
          toAddresses: to.join(', '),
          ccAddresses: cc.length > 0 ? cc.join(', ') : null,
          bccAddresses: bcc.length > 0 ? bcc.join(', ') : null,
          subject: rendered.subject,
          status: 'failed',
          error: message,
          transferId: input.transferId ?? null,
          sentByUserId: input.sentByUserId ?? null,
        },
      });
      logStructuredEvent(this.logger, 'warn', {
        event: 'mail_send_failed',
        templateKey: input.templateKey,
        transferId: input.transferId ?? null,
        error: message,
      });
      throw new BadRequestException(`Slanje emaila nije uspjelo: ${message}`);
    } finally {
      transporter.close();
    }

    const log = await this.prisma.emailLog.create({
      data: {
        templateKey: input.templateKey,
        templateId: rendered.templateId,
        toAddresses: to.join(', '),
        ccAddresses: cc.length > 0 ? cc.join(', ') : null,
        bccAddresses: bcc.length > 0 ? bcc.join(', ') : null,
        subject: rendered.subject,
        status: 'sent',
        transferId: input.transferId ?? null,
        sentByUserId: input.sentByUserId ?? null,
      },
    });
    logStructuredEvent(this.logger, 'log', {
      event: 'mail_sent',
      templateKey: input.templateKey,
      transferId: input.transferId ?? null,
      recipients: to.length + cc.length + bcc.length,
    });
    return log;
  }

  async listLogs(limit = 50): Promise<EmailLog[]> {
    const take = Math.min(Math.max(limit, 1), 200);
    return this.prisma.emailLog.findMany({ orderBy: { createdAt: 'desc' }, take });
  }
}
