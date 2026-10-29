import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAIL_PROVIDER_PRESETS, type MailProviderId } from '../mail-provider-presets';

const PROVIDER_IDS = Object.keys(MAIL_PROVIDER_PRESETS) as MailProviderId[];

export class SaveMailConfigDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(PROVIDER_IDS)
  provider!: MailProviderId;

  /** Ignoriše se za gmail/office365 (preset je autoritativan). */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  host?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @IsString()
  @MaxLength(255)
  username!: string;

  /** Prazno = zadrži postojeću sačuvanu lozinku. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  password?: string;

  @IsString()
  @MaxLength(255)
  fromEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fromName?: string;
}

export class SendTestEmailDto {
  @IsEmail()
  to!: string;
}

export class UpdateEmailTemplateDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @MaxLength(300)
  subject!: string;

  @IsString()
  @MaxLength(100_000)
  bodyHtml!: string;

  @IsString()
  @MaxLength(100_000)
  bodyText!: string;

  @IsBoolean()
  enabled!: boolean;
}

export class PreviewEmailTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  bodyText?: string;
}

/** Adrese se šalju kao stringovi razdvojeni zarezom (To/CC/BCC polja u UI-u). */
export class SendTransferEmailDto {
  @IsString()
  @MaxLength(2000)
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  cc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bcc?: string;
}
