import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  httpRequestMetricsRegistry,
  recordHttpRequest,
  type HttpRequestMetricsSnapshot,
} from '../src/common/http/http-request-metrics.registry';
import { correlationIdMiddleware } from '../src/common/middleware/correlation-id.middleware';
import { HttpRequestMetricsService } from '../src/modules/health/http-request-metrics.service';
import { evaluateHttpRequestMetrics } from '../src/modules/health/utils/http-request-metrics.util';
import { SETTINGS_REGISTRY } from '../src/modules/settings/settings.registry';
import type { SettingsService } from '../src/modules/settings/settings.service';

interface CapturedLog {
  level: 'log' | 'warn' | 'error';
  line: string;
}

interface FakeRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  originalUrl: string;
  url: string;
}

/** Drive the real Express middleware without starting a Nest application. */
const runRequest = (request: FakeRequest, status: number): void => {
  let finish: (() => void) | undefined;
  const response = {
    statusCode: status,
    setHeader: () => undefined,
    on: (event: string, handler: () => void) => {
      if (event === 'finish') finish = handler;
    },
  };
  correlationIdMiddleware(request as never, response as never, (() => undefined) as never);
  assert.ok(finish, 'middleware must register a finish handler');
  finish();
};

const main = async (): Promise<void> => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('HTTP request metrics wiring check is restricted to NODE_ENV=test');
  }

  const at = new Date('2026-10-27T09:00:00.000Z');
  httpRequestMetricsRegistry.reset(at);

  // Real middleware path: health probes are excluded, business routes counted.
  runRequest(
    {
      headers: { 'x-request-id': 'cid-health' },
      method: 'GET',
      originalUrl: '/backend/health/ready',
      url: '/backend/health/ready',
    },
    503,
  );
  runRequest(
    {
      headers: { 'x-request-id': 'cid-equipment' },
      method: 'GET',
      originalUrl: '/backend/equipment/42?token=top-secret',
      url: '/backend/equipment/42',
    },
    200,
  );
  runRequest(
    {
      headers: {},
      method: 'POST',
      originalUrl: '/backend/transfers/8f14e45f-ea9d-4b1a-9c0e-3f8a1b2c4d5e/finalize',
      url: '/backend/transfers/8f14e45f-ea9d-4b1a-9c0e-3f8a1b2c4d5e/finalize',
    },
    500,
  );

  // Controlled latencies/statuses so the p95 histogram and error rate are
  // deterministic; route labels must collapse to one bounded key.
  for (let index = 0; index < 18; index += 1) {
    recordHttpRequest({
      method: 'POST',
      path: `/backend/inventory/${index}/close`,
      status: 500,
      durationMs: 3_000,
      at,
    });
  }

  const settings = {
    getNumberValue: async (_key: string, fallback: number): Promise<number> => fallback,
  } as unknown as SettingsService;
  const service = new HttpRequestMetricsService(settings);
  const logs: CapturedLog[] = [];
  (service as unknown as { logger: Record<string, (line: string) => void> }).logger = {
    log: (line: string) => logs.push({ level: 'log', line }),
    warn: (line: string) => logs.push({ level: 'warn', line }),
    error: (line: string) => logs.push({ level: 'error', line }),
  };

  const report = async (): Promise<{ snapshot: HttpRequestMetricsSnapshot; log: CapturedLog }> => {
    const start = logs.length;
    const snapshot = await service.reportMetrics();
    assert.ok(snapshot, 'reportMetrics must return a snapshot');
    assert.equal(logs.length, start + 1, 'each report emits exactly one summary line');
    return { snapshot, log: logs[start] };
  };

  const first = await report();
  assert.equal(first.snapshot.intervalRequests, 20);
  assert.equal(first.snapshot.totalRequests, 20);
  assert.equal(first.snapshot.interval5xx, 19);
  assert.equal(first.snapshot.serverErrorRatePercent, 95);
  assert.equal(first.snapshot.p95DurationMs, 5_000);
  assert.equal(first.snapshot.latencyBuckets.le_5000, 18);
  assert.equal(first.snapshot.topServerErrorRoutes[0]?.route, '/backend/inventory/:id/close');
  assert.equal(first.log.level, 'warn');

  const line = JSON.parse(first.log.line) as Record<string, unknown>;
  assert.equal(line.event, 'http_request_metrics');
  assert.equal(line.level, 'warn');
  assert.deepEqual(line.reasons, ['server_error_count', 'server_error_rate', 'p95_latency']);
  assert.equal(line.warnErrorRatePercent, 5);
  assert.equal(line.warnP95Ms, 1_000);
  assert.equal(line.warn5xxCount, 5);
  assert.equal(line.minRequestCount, 20);
  assert.ok(!first.log.line.includes('top-secret'));
  assert.ok(!first.log.line.includes('8f14e45f'));
  assert.ok(!first.log.line.includes('/backend/health/ready'));
  assert.ok(Array.isArray(line.topRoutes));
  assert.deepEqual(evaluateHttpRequestMetrics(first.snapshot, {
    warnErrorRatePercent: 5,
    warnP95Ms: 1_000,
    warn5xxCount: 5,
    minRequestCount: 20,
  }).reasons, line.reasons);

  const second = await report();
  assert.equal(second.snapshot.intervalRequests, 0);
  assert.equal(second.snapshot.totalRequests, 20);
  assert.equal(second.snapshot.total5xx, 19);
  assert.equal(second.log.level, 'log');
  assert.deepEqual(JSON.parse(second.log.line).reasons, []);

  // Configuration wiring: bootstrap installs the middleware, the health module
  // schedules the reporter and every threshold has a validated default.
  const mainSource = readFileSync(resolve('src/main.ts'), 'utf8');
  assert.ok(mainSource.includes('app.use(correlationIdMiddleware)'));
  const healthModuleSource = readFileSync(
    resolve('src/modules/health/health.module.ts'),
    'utf8',
  );
  assert.ok(healthModuleSource.includes('HttpRequestMetricsService'));
  const expectedSettings: Record<string, number> = {
    'http.metrics.warn_error_rate_percent': 5,
    'http.metrics.warn_p95_ms': 1_000,
    'http.metrics.warn_5xx_count': 5,
    'http.metrics.min_request_count': 20,
  };
  for (const [key, defaultValue] of Object.entries(expectedSettings)) {
    const definition = SETTINGS_REGISTRY.find((entry) => entry.key === key);
    assert.ok(definition, `missing setting definition: ${key}`);
    assert.equal(definition.defaultValue, defaultValue);
    assert.equal(definition.valueType, 'number');
    assert.equal(definition.scope, 'private');
    assert.ok(definition.minValue !== undefined && definition.maxValue !== undefined);
  }

  httpRequestMetricsRegistry.reset(at);
  console.log(
    `Verified HTTP request metrics: interval=${first.snapshot.intervalRequests}, ` +
      `5xx=${first.snapshot.interval5xx}, p95=${first.snapshot.p95DurationMs}ms, level=${first.log.level}.`,
  );
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
