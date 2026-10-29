export type MailProviderId = 'gmail' | 'office365' | 'custom';

export interface MailProviderPreset {
  id: MailProviderId;
  label: string;
  description: string;
  /** Za unaprijed definisane provajdere host/port/secure su zaključani na preset. */
  host: string;
  port: number;
  /** true = implicit TLS (obično port 465), false = STARTTLS/plain (obično 587/25). */
  secure: boolean;
  usernameHint: string;
  passwordHint: string;
}

export const MAIL_PROVIDER_PRESETS: Record<MailProviderId, MailProviderPreset> = {
  gmail: {
    id: 'gmail',
    label: 'Gmail / Google Workspace',
    description: 'Google SMTP server. Zahtijeva App Password (2-Step Verification).',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    usernameHint: 'Puna Gmail ili Google Workspace adresa (npr. evidencija@firma.ba)',
    passwordHint:
      'App Password od 16 znakova (Google nalog → Sigurnost → App passwords). Obična lozinka ne radi.',
  },
  office365: {
    id: 'office365',
    label: 'Microsoft 365 / Outlook',
    description: 'Microsoft 365 SMTP (SMTP AUTH mora biti omogućen za mailbox).',
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    usernameHint: 'Puna Microsoft 365 adresa (npr. evidencija@firma.ba)',
    passwordHint:
      'Lozinka naloga ili App Password ako je MFA uključen. Administrator mora omogućiti SMTP AUTH za mailbox.',
  },
  custom: {
    id: 'custom',
    label: 'Custom SMTP',
    description: 'Bilo koji vlastiti ili eksterni SMTP server.',
    host: '',
    port: 587,
    secure: false,
    usernameHint: 'Korisničko ime koje dodjeljuje vaš SMTP provajder (često puna email adresa)',
    passwordHint: 'Lozinka SMTP naloga.',
  },
};

export const isMailProviderId = (value: unknown): value is MailProviderId =>
  value === 'gmail' || value === 'office365' || value === 'custom';

/** Za gmail/office365 server namjerno ignoriše host/port/secure iz zahtjeva i
 * koristi preset — tako pogrešno ukucan host ne može tiho slomiti slanje. */
export const resolveSmtpConnectionFields = (input: {
  provider: MailProviderId;
  host?: string;
  port?: number;
  secure?: boolean;
}): { host: string; port: number; secure: boolean } => {
  if (input.provider !== 'custom') {
    const preset = MAIL_PROVIDER_PRESETS[input.provider];
    return { host: preset.host, port: preset.port, secure: preset.secure };
  }
  return {
    host: (input.host ?? '').trim(),
    port: input.port ?? 587,
    secure: input.secure ?? false,
  };
};
