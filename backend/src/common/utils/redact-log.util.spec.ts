import assert from 'node:assert/strict';
import test from 'node:test';
import { redactLogValue, redactSensitiveText } from './redact-log.util';

test('redacts credentials, tokens, emails and container paths from log text', () => {
  const raw =
    '{"password":"hunter2","authorization":"Bearer abc.def","nested":{"refreshToken":"r-123"}} ' +
    'Authorization: Bearer plain.token user@example.com ?token=query-secret ' +
    'jwt=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature ' +
    '/app/uploads/prenosnice/secret.pdf';
  const redacted = redactSensitiveText(raw);

  assert.ok(!redacted.includes('hunter2'));
  assert.ok(!redacted.includes('abc.def'));
  assert.ok(!redacted.includes('r-123'));
  assert.ok(!redacted.includes('plain.token'));
  assert.ok(!redacted.includes('user@example.com'));
  assert.ok(!redacted.includes('query-secret'));
  assert.ok(!redacted.includes('eyJhbGciOiJIUzI1NiJ9'));
  assert.ok(!redacted.includes('/app/uploads/prenosnice/secret.pdf'));
  assert.ok(redacted.includes('[redacted]'));
  assert.ok(redacted.includes('[redacted-email]'));
  assert.ok(redacted.includes('[redacted-path]'));
});

test('redactLogValue handles nested objects, errors and unknown values', () => {
  const object = redactLogValue({
    password: 'secret',
    nested: { accessToken: 'token-value' },
    count: 3,
  }) as Record<string, unknown>;
  assert.equal(object.password, '[redacted]');
  assert.equal((object.nested as Record<string, unknown>).accessToken, '[redacted]');
  assert.equal(object.count, 3);

  const error = redactLogValue(new Error('failed with password=secret')) as string;
  assert.ok(!error.includes('secret'));
  assert.equal(redactLogValue(42), 42);
});

test('preserves ordinary operational text', () => {
  const raw = 'event=http_request path=/transfers status=200 durationMs=12';
  assert.equal(redactSensitiveText(raw), raw);
});
