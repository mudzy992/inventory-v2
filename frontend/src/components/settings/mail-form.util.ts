import type { MailConfigDto, MailProviderId, MailProviderPresetDto } from '../../api/mail-api';

export interface MailConfigFormState {
  enabled: boolean;
  provider: MailProviderId;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  hasPassword: boolean;
}

export const toMailConfigFormState = (config: MailConfigDto): MailConfigFormState => ({
  enabled: config.enabled,
  provider: config.provider,
  host: config.host,
  port: config.port,
  secure: config.secure,
  username: config.username,
  password: '',
  fromEmail: config.fromEmail,
  fromName: config.fromName,
  hasPassword: config.hasPassword,
});

/** Odabir provajdera puni formu njegovim presetom (custom zadržava ručne vrijednosti). */
export const applyProviderPreset = (
  state: MailConfigFormState,
  provider: MailProviderId,
  presets: MailProviderPresetDto[],
): MailConfigFormState => {
  const preset = presets.find((entry) => entry.id === provider);
  if (!preset || provider === 'custom') {
    return { ...state, provider };
  }
  return {
    ...state,
    provider,
    host: preset.host,
    port: preset.port,
    secure: preset.secure,
  };
};

export const splitEmailList = (raw: string): string[] =>
  raw
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const EMAIL_PATTERN = /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/;

/** Validira To/CC/BCC unos; vraća poruku o grešci ili null. */
export const validateRecipientFields = (input: {
  to: string;
  cc?: string;
  bcc?: string;
}): string | null => {
  const toList = splitEmailList(input.to);
  if (toList.length === 0) {
    return 'Unesite barem jednu email adresu primaoca (polje „Za").';
  }
  const all = [...toList, ...splitEmailList(input.cc ?? ''), ...splitEmailList(input.bcc ?? '')];
  const invalid = all.find((address) => !EMAIL_PATTERN.test(address));
  if (invalid) {
    return `Email adresa "${invalid}" nije ispravna.`;
  }
  return null;
};

/** Ubacuje {{varijablu}} na kraj teksta (editor template-a). */
export const insertVariableToken = (text: string, variableName: string): string =>
  `${text}{{${variableName}}}`;
