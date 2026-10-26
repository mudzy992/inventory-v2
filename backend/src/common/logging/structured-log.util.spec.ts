import assert from 'node:assert/strict';
import test from 'node:test';
import { formatStructuredLogLine, writeStructuredLog } from './structured-log.util';

test('keeps structured payloads parseable and redacts secret values', () => {
  const line = formatStructuredLogLine('warn', {
    event: 'redis_client_error',
    message: 'connection failed password=ci-secret token=abc',
    level: 'debug',
    reconnectCount: 2,
  });
  assert.deepEqual(JSON.parse(line), {
    event: 'redis_client_error',
    message: 'connection failed password=[redacted] token=[redacted]',
    level: 'warn',
    reconnectCount: 2,
  });
  assert.equal(line.includes('ci-secret'), false);
  assert.equal(line.includes('abc'), false);
});

test('routes log to stdout and warn/error to stderr', (t) => {
  const originalOut = process.stdout.write;
  const originalErr = process.stderr.write;
  const out: string[] = [];
  const err: string[] = [];
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  t.after(() => {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
  });

  const infoLine = writeStructuredLog('log', { event: 'redis_client_ready', ready: true });
  const warnLine = writeStructuredLog('warn', { event: 'redis_client_close', ready: false });
  const errorLine = writeStructuredLog('error', { event: 'redis_client_error', ready: false });

  assert.equal(out.length, 1);
  assert.equal(err.length, 2);
  assert.equal(out[0], `${infoLine}\n`);
  assert.equal(err[0], `${warnLine}\n`);
  assert.equal(err[1], `${errorLine}\n`);
  assert.equal(JSON.parse(warnLine).level, 'warn');
  assert.equal(JSON.parse(errorLine).level, 'error');
});

test('falls back to a safe structured error when a payload is not serializable', () => {
  const circular: Record<string, unknown> = { event: 'redis_client_event' };
  circular.self = circular;
  const line = formatStructuredLogLine('log', circular as { event: string });
  assert.deepEqual(JSON.parse(line), {
    event: 'structured_log_serialization_error',
    level: 'error',
  });
});
