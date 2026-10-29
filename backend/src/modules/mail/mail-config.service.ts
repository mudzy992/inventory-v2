import { BadRequestException, Injectable } from '@nestjs/common';
import type { MailConfiguration } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { SaveMailConfigDto } from './dto/mail.dto';
import {
  MAIL_PROVIDER_PRESETS,
  resolveSmtpConnectionFields,
  type MailProviderId,
  type MailProviderPreset,
} from './mail-provider-presets';
import { isValidEmailAddress } from './utils/email-address.util';
import {
  decryptMailSecret,
  encryptMailSecret,
  resolveMailSecretKey,
} from './utils/mail-secret.util';

export interface MailConfigResponse {
  enabled: boolean;
  provider: MailProviderId;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName: string;
  hasPassword: boolean;
  presets: MailProviderPreset[];
}

/** Interna konfiguracija sa dešifrovanom lozinkom — nikad se ne vraća API-jem. */
export interface ResolvedMailConfig {
  enabled: boolean;
  provider: MailProviderId;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
}

const CONFIG_ID = 'default';

@Injectable()
export class MailConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private async getRow(): Promise<MailConfiguration | null> {
    return this.prisma.mailConfiguration.findUnique({ where: { id: CONFIG_ID } });
  }

  async getConfigResponse(): Promise<MailConfigResponse> {
    const row = await this.getRow();
    const provider = (row?.provider ?? 'custom') as MailProviderId;
    const connection = resolveSmtpConnectionFields({
      provider,
      host: row?.host ?? '',
      port: row?.port ?? 587,
      secure: row?.secure ?? false,
    });
    return {
      enabled: row?.enabled ?? false,
      provider,
      ...connection,
      username: row?.username ?? '',
      fromEmail: row?.fromEmail ?? '',
      fromName: row?.fromName ?? '',
      hasPassword: Boolean(row?.passwordEncrypted),
      presets: Object.values(MAIL_PROVIDER_PRESETS),
    };
  }

  async saveConfig(dto: SaveMailConfigDto): Promise<MailConfigResponse> {
    const connection = resolveSmtpConnectionFields(dto);
    const existing = await this.getRow();

    let passwordEncrypted = existing?.passwordEncrypted ?? null;
    const newPassword = dto.password?.trim() ?? '';
    if (newPassword) {
      const key = resolveMailSecretKey();
      if (!key) {
        throw new BadRequestException(
          'Server nema postavljen MAIL_CONFIG_SECRET/JWT_SECRET — lozinka se ne može sigurno sačuvati.',
        );
      }
      passwordEncrypted = encryptMailSecret(newPassword, key);
    }

    if (dto.enabled) {
      const problems: string[] = [];
      if (!connection.host) problems.push('host');
      if (!dto.username.trim()) problems.push('korisničko ime');
      if (!isValidEmailAddress(dto.fromEmail)) problems.push('ispravna „Od" (from) email adresa');
      if (!passwordEncrypted) problems.push('lozinka');
      if (problems.length > 0) {
        throw new BadRequestException(
          `Za uključivanje slanja emaila nedostaje: ${problems.join(', ')}.`,
        );
      }
    }

    await this.prisma.mailConfiguration.upsert({
      where: { id: CONFIG_ID },
      create: {
        id: CONFIG_ID,
        enabled: dto.enabled,
        provider: dto.provider,
        ...connection,
        username: dto.username.trim(),
        passwordEncrypted,
        fromEmail: dto.fromEmail.trim(),
        fromName: (dto.fromName ?? '').trim(),
      },
      update: {
        enabled: dto.enabled,
        provider: dto.provider,
        ...connection,
        username: dto.username.trim(),
        passwordEncrypted,
        fromEmail: dto.fromEmail.trim(),
        fromName: (dto.fromName ?? '').trim(),
      },
    });
    return this.getConfigResponse();
  }

  /** Konfiguracija spremna za nodemailer; baca BadRequest ako slanje nije
   * omogućeno ili je nepotpuno — pozivaoci to prikazuju korisniku. */
  async resolveForSending(): Promise<ResolvedMailConfig> {
    const row = await this.getRow();
    if (!row?.enabled) {
      throw new BadRequestException(
        'Slanje emaila nije omogućeno. Administrator mora uključiti SMTP u postavkama e-pošte.',
      );
    }
    const provider = row.provider as MailProviderId;
    const connection = resolveSmtpConnectionFields({
      provider,
      host: row.host,
      port: row.port,
      secure: row.secure,
    });
    const key = resolveMailSecretKey();
    const password =
      row.passwordEncrypted && key ? decryptMailSecret(row.passwordEncrypted, key) : null;
    if (!connection.host || !row.username.trim() || !password) {
      throw new BadRequestException(
        'SMTP konfiguracija je nepotpuna (host, korisničko ime ili lozinka). Provjerite postavke e-pošte.',
      );
    }
    return {
      enabled: true,
      provider,
      ...connection,
      username: row.username,
      password,
      fromEmail: row.fromEmail,
      fromName: row.fromName,
    };
  }
}
