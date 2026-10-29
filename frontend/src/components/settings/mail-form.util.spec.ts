import { describe, expect, it } from 'vitest';
import type { MailConfigDto } from '../../api/mail-api';
import {
  applyProviderPreset,
  insertVariableToken,
  splitEmailList,
  toMailConfigFormState,
  validateRecipientFields,
} from './mail-form.util';

const PRESETS = [
  {
    id: 'gmail' as const,
    label: 'Gmail',
    description: '',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    usernameHint: '',
    passwordHint: '',
  },
  {
    id: 'custom' as const,
    label: 'Custom',
    description: '',
    host: '',
    port: 25,
    secure: false,
    usernameHint: '',
    passwordHint: '',
  },
];

const baseState = {
  enabled: true,
  provider: 'custom' as const,
  host: 'mail.firma.ba',
  port: 25,
  secure: true,
  username: 'user',
  password: '',
  fromEmail: 'a@firma.ba',
  fromName: '',
  hasPassword: true,
};

describe('mail-form.util', () => {
  it('maps config DTO to form state and clears the password field', () => {
    const config: MailConfigDto = {
      enabled: true,
      provider: 'gmail',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      username: 'u@firma.ba',
      fromEmail: 'u@firma.ba',
      fromName: 'Evidencija',
      hasPassword: true,
      presets: [],
    };
    const state = toMailConfigFormState(config);
    expect(state.password).toBe('');
    expect(state.hasPassword).toBe(true);
    expect(state.provider).toBe('gmail');
  });

  it('applies provider preset host/port/secure, custom keeps manual values', () => {
    const gmail = applyProviderPreset(baseState, 'gmail', PRESETS);
    expect(gmail.host).toBe('smtp.gmail.com');
    expect(gmail.port).toBe(587);
    expect(gmail.secure).toBe(false);
    const back = applyProviderPreset(gmail, 'custom', PRESETS);
    expect(back.host).toBe('smtp.gmail.com');
    expect(back.provider).toBe('custom');
  });

  it('splits and validates recipient lists', () => {
    expect(splitEmailList(' a@firma.ba, b@firma.ba; ')).toEqual(['a@firma.ba', 'b@firma.ba']);
    expect(validateRecipientFields({ to: '' })).toContain('barem jednu');
    expect(validateRecipientFields({ to: 'lose' })).toContain('nije ispravna');
    expect(validateRecipientFields({ to: 'a@firma.ba', cc: 'b@firma.ba' })).toBeNull();
    expect(validateRecipientFields({ to: 'a@firma.ba', bcc: 'greska' })).toContain('greska');
  });

  it('inserts variable tokens', () => {
    expect(insertVariableToken('<p>Pozdrav ', 'documentNumber')).toBe(
      '<p>Pozdrav {{documentNumber}}',
    );
  });
});
