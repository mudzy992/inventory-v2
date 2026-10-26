import assert from 'node:assert/strict';
import test from 'node:test';
import { formatLogMessage } from './correlation.logger';

test('prefixes free-form log messages with the active correlation ID', () => {
  assert.equal(formatLogMessage('hello', 'cid-1'), '[cid=cid-1] hello');
});

test('preserves JSON log events and enriches them with correlation ID and level', () => {
  const line = formatLogMessage('{"event":"login","attempt":2}', 'cid-2', 'warn');
  assert.deepEqual(JSON.parse(line), {
    correlationId: 'cid-2',
    level: 'warn',
    event: 'login',
    attempt: 2,
  });
});

test('redacts secrets before formatting structured object log messages', () => {
  const line = formatLogMessage(
    { event: 'login', password: 'hunter2', nested: { refreshToken: 'r-123' } },
    'cid-2',
    'error',
  );
  assert.deepEqual(JSON.parse(line), {
    correlationId: 'cid-2',
    level: 'error',
    event: 'login',
    password: '[redacted]',
    nested: { refreshToken: '[redacted]' },
  });
  assert.ok(!line.includes('hunter2'));
  assert.ok(!line.includes('r-123'));
});

test('does not allow payload fields to override logger metadata', () => {
  const line = formatLogMessage(
    '{"event":"test","level":"debug","correlationId":"spoofed"}',
    'cid-3',
    'warn',
  );
  assert.equal(JSON.parse(line).level, 'warn');
  assert.equal(JSON.parse(line).correlationId, 'cid-3');
});

test('omits the prefix outside a request or job context', () => {
  assert.equal(formatLogMessage('background work'), 'background work');
});
