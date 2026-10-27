import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyHttpStatus,
  HTTP_REQUEST_METRICS_MAX_ROUTES,
  HTTP_REQUEST_OVERFLOW_ROUTE,
  httpRequestMetricsRegistry,
  isHealthProbeRoute,
  normalizeRequestRoute,
  recordHttpRequest,
  type HttpRequestMetricsSnapshot,
} from './http-request-metrics.registry';

const at = new Date('2026-10-27T09:00:00.000Z');

const record = (
  overrides: Partial<Parameters<typeof recordHttpRequest>[0]> = {},
): void => {
  recordHttpRequest({
    method: 'GET',
    path: '/backend/transfers',
    status: 200,
    durationMs: 10,
    at,
    ...overrides,
  });
};

const snapshotJson = (snapshot: HttpRequestMetricsSnapshot): string => JSON.stringify(snapshot);

const recordWithOptions = (
  options: Parameters<typeof recordHttpRequest>[1],
  overrides: Partial<Parameters<typeof recordHttpRequest>[0]> = {},
): void => {
  recordHttpRequest(
    {
      method: 'GET',
      path: '/backend/health/ready',
      status: 503,
      durationMs: 10,
      at,
      ...overrides,
    },
    options,
  );
};

describe('normalizeRequestRoute', () => {
  it('drops query strings and replaces dynamic path segments', () => {
    assert.equal(
      normalizeRequestRoute('/backend/transfers/8f14e45f-ea9d-4b1a-9c0e-3f8a1b2c4d5e/status?token=secret'),
      '/backend/transfers/:id/status',
    );
    assert.equal(normalizeRequestRoute('/equipment/12345/items/abcdef0123456789'), '/equipment/:id/items/:id');
    assert.equal(normalizeRequestRoute('/documents/report-2026.pdf'), '/documents/:id');
  });

  it('never keeps opaque values, emails or redacted container paths', () => {
    const withEmail = normalizeRequestRoute('/users/ana.petrovic@example.com/profile');
    assert.equal(withEmail, '/users/:id/profile');
    assert.ok(!withEmail.includes('example.com'));
    const withContainerPath = normalizeRequestRoute('/app/tmp/private/file');
    assert.ok(!withContainerPath.includes('private'));
    const withToken = normalizeRequestRoute('/reset/Bearer eyJhbGciOiJIUzI1NiJ9.x.y?token=top-secret');
    assert.ok(!withToken.includes('eyJhbGciOiJIUzI1NiJ9'));
    assert.ok(!withToken.includes('top-secret'));
  });

  it('caps segment count and length so a hostile URL cannot grow unbounded', () => {
    const normalized = normalizeRequestRoute(`/${Array.from({ length: 40 }, (_, i) => `seg${i}`).join('/')}`);
    assert.equal(normalized.split('/').filter(Boolean).length, 12);
    assert.equal(normalizeRequestRoute(`/${'x'.repeat(60)}`), '/:id');
    assert.equal(normalizeRequestRoute('/'), '/');
  });
});

describe('isHealthProbeRoute / classifyHttpStatus', () => {
  it('recognises health probes with or without an API prefix', () => {
    assert.equal(isHealthProbeRoute('/health'), true);
    assert.equal(isHealthProbeRoute('/backend/health/ready'), true);
    assert.equal(isHealthProbeRoute('/health/live'), true);
    assert.equal(isHealthProbeRoute('/healthcheck'), false);
    assert.equal(isHealthProbeRoute('/backend/health-records'), false);
  });

  it('classifies status codes at class boundaries', () => {
    assert.equal(classifyHttpStatus(199), 'other');
    assert.equal(classifyHttpStatus(200), '2xx');
    assert.equal(classifyHttpStatus(302), '3xx');
    assert.equal(classifyHttpStatus(404), '4xx');
    assert.equal(classifyHttpStatus(503), '5xx');
    assert.equal(classifyHttpStatus(600), 'other');
  });
});

describe('httpRequestMetricsRegistry', () => {
  it('counts interval and lifetime traffic by status, method, route and latency bucket', () => {
    httpRequestMetricsRegistry.reset(at);
    record({ status: 201, durationMs: 12 });
    record({ method: 'POST', path: '/backend/transfers/42/finalize', status: 503, durationMs: 700 });
    record({ method: 'POST', path: '/backend/transfers/99/finalize', status: 400, durationMs: 30 });

    const snapshot = httpRequestMetricsRegistry.snapshot(at);
    assert.equal(snapshot.intervalRequests, 3);
    assert.equal(snapshot.totalRequests, 3);
    assert.deepEqual(snapshot.byStatusClass, { '2xx': 1, '3xx': 0, '4xx': 1, '5xx': 1, other: 0 });
    assert.deepEqual(snapshot.byMethod, { GET: 1, POST: 2 });
    assert.equal(snapshot.interval5xx, 1);
    assert.equal(snapshot.interval4xx, 1);
    assert.equal(snapshot.serverErrorRatePercent, 33.33);
    assert.equal(snapshot.clientErrorRatePercent, 33.33);
    assert.equal(snapshot.latencyBuckets.le_25, 1);
    assert.equal(snapshot.latencyBuckets.le_50, 1);
    assert.equal(snapshot.latencyBuckets.le_1000, 1);
    assert.equal(snapshot.avgDurationMs, 247.33);
    assert.equal(snapshot.maxDurationMs, 700);
    assert.equal(snapshot.lastStatus, 400);
    assert.equal(snapshot.lastRequestAt, at.toISOString());
    assert.deepEqual(
      snapshot.topRoutes.map(({ route }) => route),
      ['/backend/transfers/:id/finalize', '/backend/transfers'],
    );
    assert.deepEqual(snapshot.topServerErrorRoutes, [
      { route: '/backend/transfers/:id/finalize', requests: 2, serverErrors: 1, maxDurationMs: 700 },
    ]);
  });

  it('keeps no raw IDs, query values or secrets in the snapshot', () => {
    httpRequestMetricsRegistry.reset(at);
    record({
      path: '/backend/transfers/8f14e45f-ea9d-4b1a-9c0e-3f8a1b2c4d5e?token=top-secret',
      status: 500,
      durationMs: 15,
    });
    const json = snapshotJson(httpRequestMetricsRegistry.snapshot(at));
    assert.ok(!json.includes('top-secret'));
    assert.ok(!json.includes('8f14e45f'));
    assert.ok(json.includes('/backend/transfers/:id'));
  });

  it('consumes only interval counters while lifetime totals remain', () => {
    httpRequestMetricsRegistry.reset(at);
    record({ status: 500 });
    const later = new Date(at.getTime() + 30_000);
    const first = httpRequestMetricsRegistry.consumeSnapshot(later);
    assert.equal(first.intervalRequests, 1);
    assert.equal(first.intervalEndedAt, later.toISOString());
    assert.equal(first.total5xx, 1);

    const second = httpRequestMetricsRegistry.snapshot(later);
    assert.equal(second.intervalRequests, 0);
    assert.equal(second.totalRequests, 1);
    assert.equal(second.total5xx, 1);
    assert.equal(second.intervalStartedAt, later.toISOString());
    assert.equal(second.p95DurationMs, null);
    assert.deepEqual(second.topRoutes, []);
    assert.deepEqual(second.topServerErrorRoutes, []);
  });

  it('derives p95 from fixed latency buckets and uses the observed max for overflow', () => {
    httpRequestMetricsRegistry.reset(at);
    for (let index = 0; index < 10; index += 1) record({ durationMs: 40 });
    assert.equal(httpRequestMetricsRegistry.snapshot(at).p95DurationMs, 50);

    for (let index = 0; index < 5; index += 1) record({ durationMs: 6_000 });
    const snapshot = httpRequestMetricsRegistry.snapshot(at);
    assert.equal(snapshot.latencyBuckets.over_5000, 5);
    assert.equal(snapshot.p95DurationMs, 6_000);
  });

  it('folds new routes into a bounded overflow bucket after the route cap', () => {
    httpRequestMetricsRegistry.reset(at);
    for (let index = 0; index < HTTP_REQUEST_METRICS_MAX_ROUTES + 3; index += 1) {
      record({ path: `/resource-${index}` });
    }
    const snapshot = httpRequestMetricsRegistry.snapshot(at);
    assert.equal(snapshot.intervalRequests, HTTP_REQUEST_METRICS_MAX_ROUTES + 3);
    assert.equal(snapshot.overflowRequests, 3);
    assert.equal(
      snapshot.topRoutes.find(({ route }) => route === HTTP_REQUEST_OVERFLOW_ROUTE)?.requests,
      3,
    );
    assert.equal(Object.keys(snapshot.byStatusClass).length, 5);
    assert.ok(snapshot.topRoutes.length <= 5);

    record({ path: '/resource-0' });
    assert.equal(httpRequestMetricsRegistry.snapshot(at).overflowRequests, 3);
  });

  it('skips health probes by default but can include them explicitly', () => {
    httpRequestMetricsRegistry.reset(at);
    record({ path: '/backend/health/ready', status: 503 });
    assert.equal(httpRequestMetricsRegistry.snapshot(at).intervalRequests, 0);

    recordWithOptions({ skipHealthProbes: false });
    assert.equal(httpRequestMetricsRegistry.snapshot(at).intervalRequests, 1);
  });

  it('sanitises malformed status, method and duration values', () => {
    httpRequestMetricsRegistry.reset(at);
    record({ method: 'get\n', status: Number.NaN, durationMs: Number.NaN });
    record({ method: '', status: -1, durationMs: -50 });
    record({ method: 'TRACE', status: 9999, durationMs: 99_999_999 });

    const snapshot = httpRequestMetricsRegistry.snapshot(at);
    assert.equal(snapshot.intervalRequests, 3);
    assert.equal(snapshot.byStatusClass.other, 3);
    assert.deepEqual(snapshot.byMethod, { OTHER: 2, TRACE: 1 });
    assert.equal(snapshot.maxDurationMs, 3_600_000);
    assert.equal(snapshot.latencyBuckets.le_25, 2);
    assert.equal(snapshot.latencyBuckets.over_5000, 1);
  });

  it('reset clears lifetime and interval state', () => {
    httpRequestMetricsRegistry.reset(at);
    record({ status: 500 });
    httpRequestMetricsRegistry.reset(new Date(at.getTime() + 60_000));
    const snapshot = httpRequestMetricsRegistry.snapshot(at);
    assert.equal(snapshot.totalRequests, 0);
    assert.equal(snapshot.intervalRequests, 0);
    assert.equal(snapshot.lastRequestAt, null);
    assert.equal(snapshot.lastStatus, null);
    assert.equal(snapshot.total5xx, 0);
  });
});
