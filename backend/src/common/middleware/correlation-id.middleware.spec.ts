import assert from 'node:assert/strict';
import test from 'node:test';
import { createCorrelationIdMiddleware } from './correlation-id.middleware';
import {
  CORRELATION_ID_HEADER,
  CORRELATION_ID_RESPONSE_HEADER,
  getCorrelationId,
} from '../utils/correlation-id.util';

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
});

const runMiddleware = (harness: MiddlewareHarness): void => {
  const middleware = createCorrelationIdMiddleware((line) => harness.logs.push(line));
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
