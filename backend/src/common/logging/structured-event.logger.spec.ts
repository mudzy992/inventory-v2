import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  logStructuredEvent,
  safeErrorText,
  type NestLoggerLike,
} from './structured-event.logger';
import type { StructuredLogLevel } from './structured-log.util';

interface CapturedLog {
  level: string;
  line: string;
}

const capture = (): { logger: NestLoggerLike; logs: CapturedLog[] } => {
  const logs: CapturedLog[] = [];
  const logger: NestLoggerLike = {
    log: (line) => logs.push({ level: 'log', line }),
    warn: (line) => logs.push({ level: 'warn', line }),
    error: (line) => logs.push({ level: 'error', line }),
    debug: (line) => logs.push({ level: 'debug', line }),
  };
  return { logger, logs };
};

describe('safeErrorText', () => {
  it('handles Error, string and empty values with a bounded length', () => {
    assert.equal(safeErrorText(new Error('connect ECONNREFUSED')), 'connect ECONNREFUSED');
    assert.equal(safeErrorText('plain failure'), 'plain failure');
    assert.equal(safeErrorText(undefined), '');
    assert.equal(safeErrorText(null), '');
    assert.equal(safeErrorText(42), '42');
    assert.equal(safeErrorText(new Error('x'.repeat(900))).length, 500);
  });
});

describe('logStructuredEvent', () => {
  it('routes each level to the matching Nest logger method with one JSON line', () => {
    const { logger, logs } = capture();
    const levels: StructuredLogLevel[] = ['log', 'warn', 'error', 'debug'];
    for (const level of levels) {
      const line = logStructuredEvent(logger, level, { event: 'test_event', levelName: level });
      assert.equal(logs.at(-1)?.level, level);
      assert.equal(logs.at(-1)?.line, line);
      assert.equal(line.split('\n').length, 1);
      assert.deepEqual(JSON.parse(line), {
        event: 'test_event',
        levelName: level,
        level,
      });
    }
    assert.equal(logs.length, 4);
  });

  it('redacts secrets, tokens, e-mails and container paths in every field', () => {
    const { logger, logs } = capture();
    const line = logStructuredEvent(logger, 'warn', {
      event: 'worker_failed',
      error: safeErrorText(new Error('password=ci-secret token=abc user@company.ba /app/tmp/file')),
      count: 2,
    });
    const payload = JSON.parse(line) as Record<string, unknown>;
    assert.equal(payload.event, 'worker_failed');
    assert.equal(payload.level, 'warn');
    assert.equal(payload.count, 2);
    assert.ok(!line.includes('ci-secret'));
    assert.ok(!line.includes('token=abc'));
    assert.ok(!line.includes('user@company.ba'));
    assert.ok(!line.includes('/app/tmp/file'));
    assert.equal(logs.length, 1);
  });

  it('falls back to log when the logger has no debug method', () => {
    const logs: CapturedLog[] = [];
    const logger: NestLoggerLike = {
      log: (line) => logs.push({ level: 'log', line }),
      warn: (line) => logs.push({ level: 'warn', line }),
      error: (line) => logs.push({ level: 'error', line }),
    };
    const line = logStructuredEvent(logger, 'debug', { event: 'debug_event' });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'log');
    assert.equal(JSON.parse(line).event, 'debug_event');
  });

  it('never throws or emits free-form text for an unserializable payload', () => {
    const { logger, logs } = capture();
    const circular: Record<string, unknown> = { event: 'broken_event' };
    circular.self = circular;
    const line = logStructuredEvent(logger, 'error', circular as { event: string });
    assert.deepEqual(JSON.parse(line), {
      event: 'structured_log_serialization_error',
      level: 'error',
    });
    assert.equal(logs[0].level, 'error');
  });
});
