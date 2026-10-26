import assert from 'node:assert/strict';
import test from 'node:test';
import { formatLogMessage } from './correlation.logger';

test('prefixes log messages with the active correlation ID', () => {
  assert.equal(formatLogMessage('hello', 'cid-1'), '[cid=cid-1] hello');
});

test('redacts secrets before formatting structured log messages', () => {
  const line = formatLogMessage(
    { event: 'login', password: 'hunter2', nested: { refreshToken: 'r-123' } },
    'cid-2',
  );
  assert.match(line, /^\[cid=cid-2\] /u);
  assert.ok(!line.includes('hunter2'));
  assert.ok(!line.includes('r-123'));
  assert.ok(line.includes('[redacted]'));
});

test('omits the prefix outside a request or job context', () => {
  assert.equal(formatLogMessage('background work'), 'background work');
});
