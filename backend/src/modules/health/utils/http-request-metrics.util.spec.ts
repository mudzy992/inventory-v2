import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_HTTP_REQUEST_METRICS_THRESHOLDS,
  evaluateHttpRequestMetrics,
  HTTP_MIN_REQUEST_COUNT,
  HTTP_REQUEST_METRICS_INTERVAL_MS,
  HTTP_WARN_5XX_COUNT,
  HTTP_WARN_ERROR_RATE_PERCENT,
  HTTP_WARN_P95_MS,
  type HttpRequestMetricsThresholds,
} from './http-request-metrics.util';
import {
  httpRequestMetricsRegistry,
  recordHttpRequest,
  type HttpRequestMetricsSnapshot,
} from '../../../common/http/http-request-metrics.registry';

const at = new Date('2026-10-27T09:00:00.000Z');

const makeSnapshot = (
  overrides: Partial<HttpRequestMetricsSnapshot> = {},
): HttpRequestMetricsSnapshot => ({
  observedAt: at.toISOString(),
  startedAt: at.toISOString(),
  intervalStartedAt: at.toISOString(),
  intervalEndedAt: at.toISOString(),
  totalRequests: 0,
  intervalRequests: 0,
  byStatusClass: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, other: 0 },
  byMethod: {},
  interval4xx: 0,
  interval5xx: 0,
  total4xx: 0,
  total5xx: 0,
  serverErrorRatePercent: 0,
  clientErrorRatePercent: 0,
  avgDurationMs: 0,
  maxDurationMs: 0,
  p95DurationMs: null,
  latencyBuckets: {},
  overflowRequests: 0,
  topRoutes: [],
  topServerErrorRoutes: [],
  lastRequestAt: null,
  lastStatus: null,
  ...overrides,
});

describe('HTTP request metrics defaults', () => {
  it('uses safe, documented defaults', () => {
    assert.equal(HTTP_REQUEST_METRICS_INTERVAL_MS, 30_000);
    assert.equal(HTTP_WARN_ERROR_RATE_PERCENT, 5);
    assert.equal(HTTP_WARN_P95_MS, 1_000);
    assert.equal(HTTP_WARN_5XX_COUNT, 5);
    assert.equal(HTTP_MIN_REQUEST_COUNT, 20);
    assert.deepEqual(DEFAULT_HTTP_REQUEST_METRICS_THRESHOLDS, {
      warnErrorRatePercent: 5,
      warnP95Ms: 1_000,
      warn5xxCount: 5,
      minRequestCount: 20,
    });
  });
});

describe('evaluateHttpRequestMetrics', () => {
  it('stays quiet for a healthy interval', () => {
    const evaluation = evaluateHttpRequestMetrics(
      makeSnapshot({ intervalRequests: 100, p95DurationMs: 250, byStatusClass: { '2xx': 100, '3xx': 0, '4xx': 0, '5xx': 0, other: 0 } }),
    );
    assert.deepEqual(evaluation, { level: 'log', reasons: [] });
  });

  it('stays quiet for an empty interval', () => {
    assert.deepEqual(evaluateHttpRequestMetrics(makeSnapshot()), { level: 'log', reasons: [] });
  });

  it('warns about the absolute 5xx count even on low traffic', () => {
    const evaluation = evaluateHttpRequestMetrics(
      makeSnapshot({ intervalRequests: 5, interval5xx: 5, serverErrorRatePercent: 100, p95DurationMs: 25 }),
    );
    assert.equal(evaluation.level, 'warn');
    assert.deepEqual(evaluation.reasons, ['server_error_count']);
  });

  it('requires a minimum sample before rate or p95 warnings', () => {
    const few = evaluateHttpRequestMetrics(
      makeSnapshot({ intervalRequests: 4, interval5xx: 0, serverErrorRatePercent: 0, p95DurationMs: 5_000 }),
    );
    assert.deepEqual(few.reasons, []);

    const enough = evaluateHttpRequestMetrics(
      makeSnapshot({ intervalRequests: 20, interval5xx: 0, serverErrorRatePercent: 0, p95DurationMs: 5_000 }),
    );
    assert.deepEqual(enough.reasons, ['p95_latency']);
  });

  it('warns about the server error rate and p95 latency together in a stable order', () => {
    const evaluation = evaluateHttpRequestMetrics(
      makeSnapshot({
        intervalRequests: 40,
        interval5xx: 6,
        serverErrorRatePercent: 15,
        p95DurationMs: 2_500,
      }),
    );
    assert.equal(evaluation.level, 'warn');
    assert.deepEqual(evaluation.reasons, [
      'server_error_count',
      'server_error_rate',
      'p95_latency',
    ]);
  });

  it('honours custom thresholds and treats p95 at the threshold as healthy', () => {
    const thresholds: HttpRequestMetricsThresholds = {
      warnErrorRatePercent: 50,
      warnP95Ms: 2_500,
      warn5xxCount: 100,
      minRequestCount: 1,
    };
    const snapshot = makeSnapshot({
      intervalRequests: 20,
      interval5xx: 4,
      serverErrorRatePercent: 20,
      p95DurationMs: 2_500,
    });
    assert.deepEqual(evaluateHttpRequestMetrics(snapshot, thresholds), {
      level: 'log',
      reasons: [],
    });
    assert.deepEqual(
      evaluateHttpRequestMetrics({ ...snapshot, p95DurationMs: 5_000 }, thresholds).reasons,
      ['p95_latency'],
    );
    assert.deepEqual(
      evaluateHttpRequestMetrics({ ...snapshot, serverErrorRatePercent: 50 }, thresholds).reasons,
      ['server_error_rate'],
    );
  });

  it('evaluates a real registry snapshot produced by slow failing requests', () => {
    httpRequestMetricsRegistry.reset(at);
    for (let index = 0; index < 20; index += 1) {
      recordHttpRequest({
        method: 'POST',
        path: `/backend/inventory/${index}/close`,
        status: 500,
        durationMs: 6_000,
        at,
      });
    }
    const snapshot = httpRequestMetricsRegistry.snapshot(at);
    assert.equal(snapshot.interval5xx, 20);
    assert.equal(snapshot.serverErrorRatePercent, 100);
    assert.equal(snapshot.p95DurationMs, 6_000);
    assert.equal(snapshot.topServerErrorRoutes[0]?.route, '/backend/inventory/:id/close');
    assert.deepEqual(evaluateHttpRequestMetrics(snapshot).reasons, [
      'server_error_count',
      'server_error_rate',
      'p95_latency',
    ]);
    httpRequestMetricsRegistry.reset(at);
  });
});
