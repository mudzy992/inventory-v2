import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decryptMailSecret,
  deriveMailSecretKey,
  encryptMailSecret,
  resolveMailSecretKey,
} from './mail-secret.util';

test('encrypt/decrypt round-trip returns the original password', () => {
  const key = deriveMailSecretKey('test-secret-value');
  const encrypted = encryptMailSecret('SuperTajna#123', key);
  assert.ok(encrypted.startsWith('v1:'));
  assert.equal(decryptMailSecret(encrypted, key), 'SuperTajna#123');
});

test('decrypt with a different key fails closed (null)', () => {
  const encrypted = encryptMailSecret('lozinka', deriveMailSecretKey('jedan'));
  assert.equal(decryptMailSecret(encrypted, deriveMailSecretKey('drugi')), null);
});

test('decrypt rejects malformed payloads', () => {
  const key = deriveMailSecretKey('x');
  assert.equal(decryptMailSecret('nije-enkriptovano', key), null);
  assert.equal(decryptMailSecret('v1:samo:dva', key), null);
});

test('resolveMailSecretKey prefers MAIL_CONFIG_SECRET and falls back to JWT_SECRET', () => {
  const fromMailSecret = resolveMailSecretKey({
    MAIL_CONFIG_SECRET: 'mail-secret',
    JWT_SECRET: 'jwt-secret',
  } as NodeJS.ProcessEnv);
  assert.deepEqual(fromMailSecret, deriveMailSecretKey('mail-secret'));
  const fromJwt = resolveMailSecretKey({ JWT_SECRET: 'jwt-secret' } as NodeJS.ProcessEnv);
  assert.deepEqual(fromJwt, deriveMailSecretKey('jwt-secret'));
  assert.equal(resolveMailSecretKey({} as NodeJS.ProcessEnv), null);
});
