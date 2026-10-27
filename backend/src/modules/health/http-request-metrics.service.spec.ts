import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  httpRequestMetricsRegistry,
  recordHttpRequest,
  type HttpRequestMetricsSnapshot,
} from '../../common/http/http-request-metrics.registry';
import { SettingsService } from '../settings/settings.service';
import { HttpRequestMetricsService } from './http-request-metrics.service';
import {
  DEFAULT_HTTP_REQUEST_METRICS_THRESHOLDS,
  HTTP_WARN_5XX_COUNT,
  HTTP_WARN_ERROR_RATE_PERCENT,
  HTTP_WARN_P95_MS,
} from './utils/http-request-metrics.util';

interface CapturedLog {
  level: 'log' | 'warn' | 'error';
  line: string;
}

const at = new Date('2026-10-27T09:00:00.000Z');
const SETTING_KEYS = [
  'http.metrics.warn_error_rate_percent',
  'http.metrics.warn_p95_ms',
  'http.metrics.warn_5xx_count',
  'http.metrics.min_request_count',
];

const createHarness = (
  options: {
    values?: Record<string, number>;
    settingsError?: Error;
    blocked?: Promise<void>;
  } = {},
): {
  service: HttpRequestMetricsService;
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
  const service = new HttpRequestMetricsService(settings);
  const logs: CapturedLog[] = [];
  (service as unknown as { logger: Record<string, (line: string) => void> }).logger = {
    log: (line: string) => logs.push({ level: 'log', line }),
    warn: (line: string) => logs.push({ level: 'warn', line }),
    error: (line: string) => logs.push({ level: 'error', line }),
  };
  return { service, logs, readKeys };
};

const recordRequests = (count: number, status = 200, durationMs = 10): void => {
  for (let index = 0; index < count; index += 1) {
    recordHttpRequest({
      method: 'GET',
      path: `/backend/equipment/${index}`,
      status,
      durationMs,
      at,
    });
  }
};

const parseSummary = (logs: CapturedLog[]): Record<string, unknown> => {
  const summary = logs.find(({ line }) => line.includes('"event":"http_request_metrics"'));
  assert.ok(summary, 'expected an http_request_metrics log line');
  return JSON.parse(summary.line) as Record<string, unknown>;
};

describe('HttpRequestMetricsService', () => {
  it('emits a quiet structured summary with default thresholds', async () => {
    httpRequestMetricsRegistry.reset(at);
    const { service, logs, readKeys } = createHarness();
    recordRequests(3);
    const snapshot = await service.reportMetrics();
    assert.ok(snapshot);
    assert.equal(snapshot.intervalRequests, 3);
    assert.deepEqual([...readKeys].sort(), [...SETTING_KEYS].sort());
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'log');
    const line = parseSummary(logs);
    assert.equal(line.event, 'http_request_metrics');
    assert.equal(line.level, 'log');
    assert.deepEqual(line.reasons, []);
    assert.equal(line.warnErrorRatePercent, HTTP_WARN_ERROR_RATE_PERCENT);
    assert.equal(line.warnP95Ms, HTTP_WARN_P95_MS);
    assert.equal(line.warn5xxCount, HTTP_WARN_5XX_COUNT);
    assert.equal(line.intervalRequests, 3);
    assert.equal(line.totalRequests, 3);
    assert.equal(line.p95DurationMs, 25);
  });

  it('warns with ordered reasons for a slow, error-heavy interval', async () => {
    httpRequestMetricsRegistry.reset(at);
    const { service, logs } = createHarness();
    recordRequests(20, 503, 6_000);
    const snapshot = await service.reportMetrics();
    assert.ok(snapshot);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'warn');
    const line = parseSummary(logs);
    assert.equal(line.level, 'warn');
    assert.deepEqual(line.reasons, ['server_error_count', 'server_error_rate', 'p95_latency']);
    assert.equal(line.serverErrorRatePercent, 100);
    assert.equal(line.p95DurationMs, 6_000);
    assert.ok(!logs[0].line.includes('equipment/0?'));
  });

  it('uses configured thresholds from the settings store', async () => {
    httpRequestMetricsRegistry.reset(at);
    const { service, logs } = createHarness({
      values: {
        'http.metrics.warn_error_rate_percent': 2.5,
        'http.metrics.warn_p95_ms': 200,
        'http.metrics.warn_5xx_count': 2,
        'http.metrics.min_request_count': 2,
      },
    });
    recordRequests(2, 500, 300);
    await service.reportMetrics();
    const line = parseSummary(logs);
    assert.equal(line.warnErrorRatePercent, 2.5);
    assert.equal(line.warnP95Ms, 200);
    assert.equal(line.warn5xxCount, 2);
    assert.equal(line.minRequestCount, 2);
    assert.deepEqual(line.reasons, ['server_error_count', 'server_error_rate', 'p95_latency']);
  });

  it('falls back to defaults for out-of-range or non-finite setting values', async () => {
    httpRequestMetricsRegistry.reset(at);
    const { service, logs } = createHarness({
      values: {
        'http.metrics.warn_error_rate_percent': 0,
        'http.metrics.warn_p95_ms': 600_001,
        'http.metrics.warn_5xx_count': Number.NaN,
        'http.metrics.min_request_count': -1,
      },
    });
    recordRequests(1);
    await service.reportMetrics();
    const line = parseSummary(logs);
    assert.equal(line.warnErrorRatePercent, DEFAULT_HTTP_REQUEST_METRICS_THRESHOLDS.warnErrorRatePercent);
    assert.equal(line.warnP95Ms, DEFAULT_HTTP_REQUEST_METRICS_THRESHOLDS.warnP95Ms);
    assert.equal(line.warn5xxCount, DEFAULT_HTTP_REQUEST_METRICS_THRESHOLDS.warn5xxCount);
    assert.equal(line.minRequestCount, DEFAULT_HTTP_REQUEST_METRICS_THRESHOLDS.minRequestCount);
    assert.deepEqual(line.reasons, []);
  });

  it('logs a redacted settings fallback when the settings store fails', async () => {
    httpRequestMetricsRegistry.reset(at);
    const { service, logs } = createHarness({
      settingsError: new Error('password=ci-secret settings unavailable'),
    });
    recordRequests(1);
    const snapshot = await service.reportMetrics();
    assert.ok(snapshot);
    const fallbacks = logs.filter(({ line }) => line.includes('http_metrics_setting_fallback'));
    assert.equal(fallbacks.length, 4);
    for (const fallback of fallbacks) {
      assert.ok(!fallback.line.includes('ci-secret'));
      assert.ok(fallback.line.includes('[redacted]'));
    }
    const line = parseSummary(logs);
    assert.equal(line.warn5xxCount, HTTP_WARN_5XX_COUNT);
    assert.equal(logs.find(({ line }) => line.includes('http_request_metrics'))?.level, 'log');
  });

  it('does not run two reports at the same time', async () => {
    httpRequestMetricsRegistry.reset(at);
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    const { service, logs } = createHarness({ blocked });
    recordRequests(1);
    const first = service.reportMetrics();
    const overlapping = await service.reportMetrics();
    assert.equal(overlapping, null);
    release?.();
    await first;
    assert.equal(logs.filter(({ line }) => line.includes('http_request_metrics')).length, 1);
  });

  it('reports a redacted error if the registry snapshot cannot be read', async (t) => {
    httpRequestMetricsRegistry.reset(at);
    const { service, logs } = createHarness();
    const original = httpRequestMetricsRegistry.consumeSnapshot;
    (httpRequestMetricsRegistry as { consumeSnapshot: () => HttpRequestMetricsSnapshot }).consumeSnapshot =
      () => {
        throw new Error('password=registry-secret');
      };
    t.after(() => {
      httpRequestMetricsRegistry.consumeSnapshot = original;
      httpRequestMetricsRegistry.reset(at);
    });
    const snapshot = await service.reportMetrics();
    assert.equal(snapshot, null);
    const errorLog = logs.find(({ line }) => line.includes('http_request_metrics_error'));
    assert.ok(errorLog);
    assert.equal(errorLog.level, 'error');
    assert.ok(!errorLog.line.includes('registry-secret'));
  });

  it('drains only the interval between two reports', async () => {
    httpRequestMetricsRegistry.reset(at);
    const { service, logs } = createHarness();
    recordRequests(5, 500);
    await service.reportMetrics();
    recordRequests(1);
    const second = await service.reportMetrics();
    assert.ok(second);
    assert.equal(second.intervalRequests, 1);
    assert.equal(second.totalRequests, 6);
    assert.equal(second.total5xx, 5);
    assert.equal(logs.length, 2);
    assert.equal(logs[0].level, 'warn');
    assert.equal(logs[1].level, 'log');
  });
});
