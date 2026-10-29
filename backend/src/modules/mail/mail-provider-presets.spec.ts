import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAIL_PROVIDER_PRESETS,
  isMailProviderId,
  resolveSmtpConnectionFields,
} from './mail-provider-presets';

test('gmail and office365 presets carry the official SMTP endpoints', () => {
  assert.equal(MAIL_PROVIDER_PRESETS.gmail.host, 'smtp.gmail.com');
  assert.equal(MAIL_PROVIDER_PRESETS.gmail.port, 587);
  assert.equal(MAIL_PROVIDER_PRESETS.office365.host, 'smtp.office365.com');
  assert.equal(MAIL_PROVIDER_PRESETS.office365.port, 587);
});

test('predefined providers ignore user-supplied host/port/secure', () => {
  const resolved = resolveSmtpConnectionFields({
    provider: 'gmail',
    host: 'zlonamjeran.example.com',
    port: 25,
    secure: true,
  });
  assert.deepEqual(resolved, { host: 'smtp.gmail.com', port: 587, secure: false });
});

test('custom provider keeps user-supplied connection fields (trimmed)', () => {
  const resolved = resolveSmtpConnectionFields({
    provider: 'custom',
    host: '  mail.firma.ba ',
    port: 465,
    secure: true,
  });
  assert.deepEqual(resolved, { host: 'mail.firma.ba', port: 465, secure: true });
});

test('isMailProviderId narrows unknown values', () => {
  assert.equal(isMailProviderId('gmail'), true);
  assert.equal(isMailProviderId('office365'), true);
  assert.equal(isMailProviderId('yahoo'), false);
  assert.equal(isMailProviderId(undefined), false);
});
