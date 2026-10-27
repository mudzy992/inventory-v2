import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  rateLimitMetricsRegistry,
  recordRateLimitDecision,
  type RateLimitMetricsSnapshot,
  type RateLimitOutcome,
} from '../../redis/rate-limit-metrics.registry';
import { SettingsService } from '../settings/settings.service';
import { RateLimitMetricsService } from './rate-limit-metrics.service';
import {
  DEFAULT_RATE_LIMIT_METRICS_THRESHOLDS,
  RATE_LIMIT_WARN_EXCEEDED_COUNT,
} from './utils/rate-limit-metrics.util';

interface CapturedLog {
  level: 'log' | 'warn' | 'error';
  line: string;
}

const at = new Date('2026-10-27T11:00:00.000Z');
const SETTING_KEYS = [
  'rate_limit.metrics.warn_fail_open_count',
  'rate_limit.metrics.warn_consecutive_failures',
  'rate_limit.metrics.warn_exceeded_count',
];

const createHarness = (
  options: {
    values?: Record<string, number>;
    settingsError?: Error;
    blocked?: Promise<void>;
  } = {},
): {
  service: RateLimitMetricsService;
  logs: CapturedLog[];
  readKeys: string[];
} => {
  const readKeys: string[] = [];
  const settings = {
    getNumberValue: async (key: string, fallback: number): Promise<number> => {
      readKeys.push(key);
      if (options.blocked) await options.blocked;
      if (options.settingsError) throw options.settingsError;
      return options.values?.[key] ?? fallback;
    },
  } as unknown as SettingsService;
  const service = new RateLimitMetricsService(settings);
  const logs: CapturedLog[] = [];
  (service as unknown as { logger: Record<string, (line: string) => void> }).logger = {
    log: (line: string) => logs.push({ level: 'log', line }),
    warn: (line: string) => logs.push({ level: 'warn', line }),
    error: (line: string) => logs.push({ level: 'error', line }),
  };
  return { service, logs, readKeys };
};

const seed = (outcome: RateLimitOutcome, count = 1, policy = 'login'): void => {
  for (let index = 0; index < count; index += 1) {
    recordRateLimitDecision({
      policy,
      outcome,
      error: outcome.startsWith('fail_') ? new Error('connect ECONNREFUSED') : undefined,
      at,
    });
  }
};

const parseSummary = (logs: CapturedLog[]): Record<string, unknown> => {
  const summary = logs.find(({ line }) => line.includes('"event":"rate_limit_metrics"'));
  assert.ok(summary, 'expected a rate_limit_metrics log line');
  return JSON.parse(summary.line) as Record<string, unknown>;
};

describe('RateLimitMetricsService', () => {
  it('emits a quiet summary with default thresholds', async () => {
    rateLimitMetricsRegistry.reset(at);
    const { service, logs, readKeys } = createHarness();
    seed('allowed', 4);
    const snapshot = await service.reportMetrics(at);
    assert.ok(snapshot);
    assert.equal(snapshot.intervalDecisions, 4);
    assert.deepEqual([...readKeys].sort(), [...SETTING_KEYS].sort());
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'log');
    const line = parseSummary(logs);
    assert.equal(line.event, 'rate_limit_metrics');
    assert.equal(line.level, 'log');
    assert.deepEqual(line.reasons, []);
    assert.equal(line.warnFailOpenCount, DEFAULT_RATE_LIMIT_METRICS_THRESHOLDS.warnFailOpenCount);
    assert.equal(line.warnExceededCount, RATE_LIMIT_WARN_EXCEEDED_COUNT);
    assert.equal(line.intervalAllowed, 4);
  });

  it('warns with ordered reasons for a mixed outage and 429 burst', async () => {
    rateLimitMetricsRegistry.reset(at);
    const { service, logs } = createHarness({
      values: {
        'rate_limit.metrics.warn_fail_open_count': 2,
        'rate_limit.metrics.warn_consecutive_failures': 3,
        'rate_limit.metrics.warn_exceeded_count': 1,
      },
    });
    seed('exceeded', 2, 'public_equipment');
    seed('fail_open', 2);
    seed('fail_closed', 1);
    const snapshot = await service.reportMetrics(at);
    assert.ok(snapshot);
    assert.equal(snapshot.consecutiveFailures, 3);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'warn');
    const line = parseSummary(logs);
    assert.deepEqual(line.reasons, [
      'fail_closed',
      'sustained_outage',
      'fail_open_burst',
      'exceeded_burst',
    ]);
    assert.equal(line.intervalFailures, 3);
    assert.equal(line.lastFailureReason, 'connection');
    assert.ok(!logs[0].line.includes('ECONNREFUSED'));
  });

  it('uses configured thresholds from the settings store', async () => {
    rateLimitMetricsRegistry.reset(at);
    const { service, logs } = createHarness({
      values: {
        'rate_limit.metrics.warn_fail_open_count': 2,
        'rate_limit.metrics.warn_consecutive_failures': 2,
        'rate_limit.metrics.warn_exceeded_count': 2,
      },
    });
    seed('fail_open', 2);
    await service.reportMetrics(at);
    const line = parseSummary(logs);
    assert.equal(line.warnFailOpenCount, 2);
    assert.equal(line.warnConsecutiveFailures, 2);
    assert.equal(line.warnExceededCount, 2);
    assert.deepEqual(line.reasons, ['sustained_outage', 'fail_open_burst']);
  });

  it('falls back to defaults for invalid setting values', async () => {
    rateLimitMetricsRegistry.reset(at);
    const { service, logs } = createHarness({
      values: {
        'rate_limit.metrics.warn_fail_open_count': 0,
        'rate_limit.metrics.warn_consecutive_failures': Number.NaN,
        'rate_limit.metrics.warn_exceeded_count': Number.POSITIVE_INFINITY,
      },
    });
    seed('allowed');
    const snapshot = await service.reportMetrics(at);
    assert.ok(snapshot);
    const line = parseSummary(logs);
    assert.equal(line.warnFailOpenCount, 5);
    assert.equal(line.warnConsecutiveFailures, 3);
    assert.equal(line.warnExceededCount, 25);
  });

  it('logs a redacted fallback for every failing setting', async () => {
    rateLimitMetricsRegistry.reset(at);
    const { service, logs } = createHarness({
      settingsError: new Error('password=ci-secret settings unavailable'),
    });
    seed('allowed');
    assert.ok(await service.reportMetrics(at));
    const fallbacks = logs.filter(({ line }) =>
      line.includes('rate_limit_metrics_setting_fallback'),
    );
    assert.equal(fallbacks.length, 3);
    for (const fallback of fallbacks) {
      assert.ok(!fallback.line.includes('ci-secret'));
      assert.ok(fallback.line.includes('[redacted]'));
    }
    const line = parseSummary(logs);
    assert.equal(line.warnFailOpenCount, 5);
    assert.deepEqual(line.reasons, []);
  });

  it('does not run two reports at the same time', async () => {
    rateLimitMetricsRegistry.reset(at);
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    const { service, logs } = createHarness({ blocked });
    seed('allowed');
    const first = service.reportMetrics(at);
    const overlapping = await service.reportMetrics(at);
    assert.equal(overlapping, null);
    release?.();
    await first;
    assert.equal(logs.filter(({ line }) => line.includes('rate_limit_metrics')).length, 1);
  });

  it('reports a redacted error if the registry snapshot cannot be read', async (t) => {
    rateLimitMetricsRegistry.reset(at);
    const { service, logs } = createHarness();
    const original = rateLimitMetricsRegistry.consumeSnapshot;
    (rateLimitMetricsRegistry as { consumeSnapshot: () => RateLimitMetricsSnapshot }).consumeSnapshot =
      () => {
        throw new Error('password=registry-secret');
      };
    t.after(() => {
      rateLimitMetricsRegistry.consumeSnapshot = original;
      rateLimitMetricsRegistry.reset(at);
    });
    assert.equal(await service.reportMetrics(at), null);
    const errorLog = logs.find(({ line }) => line.includes('rate_limit_metrics_error'));
    assert.ok(errorLog);
    assert.equal(errorLog.level, 'error');
    assert.ok(!errorLog.line.includes('registry-secret'));
  });

  it('drains the interval but keeps the outage streak until a successful check', async () => {
    rateLimitMetricsRegistry.reset(at);
    const { service, logs } = createHarness();
    seed('fail_open', 3);
    await service.reportMetrics(at);
    const second = await service.reportMetrics(at);
    assert.ok(second);
    assert.equal(second.intervalDecisions, 0);
    assert.equal(second.consecutiveFailures, 3);
    assert.equal(second.totalFailures, 3);
    assert.equal(logs.length, 2);
    assert.equal(logs[1].level, 'warn');
    assert.deepEqual(JSON.parse(logs[1].line).reasons, ['sustained_outage']);

    seed('allowed');
    await service.reportMetrics(at);
    assert.equal(logs[2].level, 'log');
    assert.deepEqual(JSON.parse(logs[2].line).reasons, []);
  });
});
