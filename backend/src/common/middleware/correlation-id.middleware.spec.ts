import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCorrelationIdMiddleware,
  type RequestMetricsRecorder,
} from './correlation-id.middleware';
import {
  CORRELATION_ID_HEADER,
  CORRELATION_ID_RESPONSE_HEADER,
  getCorrelationId,
} from '../utils/correlation-id.util';
import { httpRequestMetricsRegistry } from '../http/http-request-metrics.registry';
import type { HttpRequestRecordEvent } from '../http/http-request-metrics.registry';

interface MiddlewareHarness {
  req: {
    headers: Record<string, string | string[] | undefined>;
    method: string;
    originalUrl: string;
    url: string;
  };
  res: {
    statusCode: number;
    headers: Record<string, string>;
    handlers: Record<string, () => void>;
  };
  logs: string[];
  nextContexts: Array<string | undefined>;
  records: HttpRequestRecordEvent[];
}

const createHarness = (headerValue?: string): MiddlewareHarness => ({
  req: {
    headers: headerValue === undefined ? {} : { [CORRELATION_ID_HEADER]: headerValue },
    method: 'GET',
    originalUrl: '/transfers?token=secret',
    url: '/transfers',
  },
  res: {
    statusCode: 201,
    headers: {},
    handlers: {},
  },
  logs: [],
  nextContexts: [],
  records: [],
});

const runMiddleware = (
  harness: MiddlewareHarness,
  record?: RequestMetricsRecorder,
): void => {
  const middleware = createCorrelationIdMiddleware(
    (line) => harness.logs.push(line),
    record ?? ((event) => harness.records.push(event)),
  );
  const res = {
    ...harness.res,
    setHeader: (key: string, value: string) => {
      harness.res.headers[key] = value;
    },
    on: (event: string, handler: () => void) => {
      harness.res.handlers[event] = handler;
    },
  };
  middleware(harness.req as never, res as never, (() => {
    harness.nextContexts.push(getCorrelationId());
  }) as never);
};

test('propagates a safe incoming correlation ID and logs a redacted request summary', () => {
  const harness = createHarness('cid-incoming');
  runMiddleware(harness);

  assert.equal(harness.res.headers[CORRELATION_ID_RESPONSE_HEADER], 'cid-incoming');
  assert.deepEqual(harness.nextContexts, ['cid-incoming']);
  harness.res.handlers.finish?.();

  assert.equal(harness.logs.length, 1);
  const payload = JSON.parse(harness.logs[0] ?? '{}') as Record<string, unknown>;
  assert.equal(payload.event, 'http_request');
  assert.equal(payload.correlationId, 'cid-incoming');
  assert.equal(payload.method, 'GET');
  assert.equal(payload.path, '/transfers');
  assert.equal(payload.status, 201);
  assert.equal(typeof payload.durationMs, 'number');
  assert.ok(!harness.logs[0]?.includes('secret'));
});

test('replaces unsafe headers with a generated UUID', () => {
  const harness = createHarness('bad\nheader');
  runMiddleware(harness);

  const generated = harness.res.headers[CORRELATION_ID_RESPONSE_HEADER];
  assert.match(
    generated ?? '',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
  );
  assert.deepEqual(harness.nextContexts, [generated]);
});

test('generates a correlation ID when no header is present', () => {
  const harness = createHarness();
  runMiddleware(harness);
  assert.match(
    harness.res.headers[CORRELATION_ID_RESPONSE_HEADER] ?? '',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
  );
});

test('records request metrics with a normalised route and no query values', () => {
  const harness = createHarness('cid-metrics');
  harness.req.method = 'POST';
  harness.req.originalUrl = '/transfers/8f14e45f-ea9d-4b1a-9c0e-3f8a1b2c4d5e/finalize?token=secret';
  harness.req.url = harness.req.originalUrl;
  harness.res.statusCode = 503;
  runMiddleware(harness);
  harness.res.handlers.finish?.();

  const payload = JSON.parse(harness.logs[0] ?? '{}') as Record<string, unknown>;
  assert.equal(payload.route, '/transfers/:id/finalize');
  assert.equal(payload.path, '/transfers/8f14e45f-ea9d-4b1a-9c0e-3f8a1b2c4d5e/finalize');
  assert.equal(payload.status, 503);
  assert.ok(!harness.logs[0]?.includes('secret'));
  assert.equal(harness.records.length, 1);
  assert.equal(harness.records[0]?.method, 'POST');
  assert.equal(harness.records[0]?.status, 503);
  assert.equal(harness.records[0]?.path, payload.path);
  assert.equal(typeof harness.records[0]?.durationMs, 'number');
});

test('a failing metrics recorder never suppresses the request log', () => {
  const harness = createHarness('cid-recorder-error');
  runMiddleware(harness, () => {
    throw new Error('metrics registry unavailable');
  });
  assert.doesNotThrow(() => harness.res.handlers.finish?.());
  assert.equal(harness.logs.length, 1);
  assert.equal(JSON.parse(harness.logs[0] ?? '{}').event, 'http_request');
});

test('the default middleware wires the real process-local metrics registry', () => {
  const at = new Date('2026-10-27T09:00:00.000Z');
  httpRequestMetricsRegistry.reset(at);
  const harness = createHarness('cid-default-recorder');
  harness.req.originalUrl = '/equipment/12345?token=secret';
  const res = {
    ...harness.res,
    setHeader: () => undefined,
    on: (event: string, handler: () => void) => {
      harness.res.handlers[event] = handler;
    },
  };
  createCorrelationIdMiddleware()(
    harness.req as never,
    res as never,
    (() => undefined) as never,
  );
  harness.res.handlers.finish?.();

  const snapshot = httpRequestMetricsRegistry.snapshot();
  assert.equal(snapshot.intervalRequests, 1);
  assert.equal(snapshot.byStatusClass['2xx'], 1);
  assert.equal(snapshot.topRoutes[0]?.route, '/equipment/:id');
  assert.ok(!JSON.stringify(snapshot).includes('secret'));
  httpRequestMetricsRegistry.reset(at);
});
