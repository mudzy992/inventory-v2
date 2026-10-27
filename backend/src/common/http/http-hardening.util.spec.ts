import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import {
  DEFAULT_HSTS_MAX_AGE_SECONDS,
  GLOBAL_RATE_LIMIT_KEY_PREFIX,
  HSTS_HEADER,
  MAX_HSTS_MAX_AGE_SECONDS,
  SECURITY_HEADERS_CATALOG,
  applySecurityHeaders,
  buildGlobalRateLimitKey,
  globalRateLimitMiddleware,
  isGlobalRateLimitExempt,
  isNoStorePath,
  isSecureRequest,
  resolveGlobalRateLimitPolicy,
  resolveSecurityHeadersPolicy,
  securityHeadersMiddleware,
  type GlobalRateLimitPolicy,
  type SecurityHeadersPolicy,
} from './http-hardening.util';

interface FakeResponse {
  res: ServerResponse;
  headers: Map<string, string | number>;
  body: () => unknown;
  status: () => number;
}

const fakeResponse = (): FakeResponse => {
  const headers = new Map<string, string | number>();
  headers.set('x-powered-by', 'Express');
  let statusCode = 200;
  let body: unknown;
  const res = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(value: number) {
      statusCode = value;
    },
    setHeader: (name: string, value: string | number) => {
      headers.set(name.toLowerCase(), value);
    },
    getHeader: (name: string) => headers.get(name.toLowerCase()),
    removeHeader: (name: string) => {
      headers.delete(name.toLowerCase());
    },
    end: (chunk?: unknown) => {
      body = chunk;
    },
  } as unknown as ServerResponse;
  return { res, headers, body: () => body, status: () => statusCode };
};

const fakeRequest = (
  url = '/backend/equipment',
  init: { headers?: Record<string, string | string[]>; ip?: string; encrypted?: boolean } = {},
): IncomingMessage =>
  ({
    url,
    headers: init.headers ?? {},
    ip: init.ip ?? '203.0.113.7',
    socket: { remoteAddress: init.ip ?? '203.0.113.7', encrypted: init.encrypted ?? false },
  }) as unknown as IncomingMessage;

const enabledHeaders: SecurityHeadersPolicy = {
  enabled: true,
  hstsMaxAgeSeconds: DEFAULT_HSTS_MAX_AGE_SECONDS,
};

test('security headers are ON by default; HSTS is bounded and 0 disables it', () => {
  assert.deepEqual(resolveSecurityHeadersPolicy({}), {
    enabled: true,
    hstsMaxAgeSeconds: DEFAULT_HSTS_MAX_AGE_SECONDS,
  });
  assert.equal(resolveSecurityHeadersPolicy({ SECURITY_HEADERS_ENABLED: 'false' }).enabled, false);
  assert.equal(resolveSecurityHeadersPolicy({ HSTS_MAX_AGE_SECONDS: '0' }).hstsMaxAgeSeconds, 0);
  assert.equal(
    resolveSecurityHeadersPolicy({ HSTS_MAX_AGE_SECONDS: String(MAX_HSTS_MAX_AGE_SECONDS) })
      .hstsMaxAgeSeconds,
    MAX_HSTS_MAX_AGE_SECONDS,
  );
  assert.equal(
    resolveSecurityHeadersPolicy({ SECURITY_HEADERS_ENABLED: ' TRUE ' }).enabled,
    true,
    'env values are trimmed and case-insensitive',
  );
  for (const bad of ['yes', '1', 'maybe', 'true false']) {
    assert.throws(() => resolveSecurityHeadersPolicy({ SECURITY_HEADERS_ENABLED: bad }), /must be either/u);
  }
  for (const bad of ['-1', '1.5', 'abc', String(MAX_HSTS_MAX_AGE_SECONDS + 1)]) {
    assert.throws(() => resolveSecurityHeadersPolicy({ HSTS_MAX_AGE_SECONDS: bad }), /must be an integer/u);
  }
});

test('global rate limit is opt-in and all bounds are fail-closed', () => {
  const defaults = resolveGlobalRateLimitPolicy({});
  assert.deepEqual(defaults, { enabled: false, max: 300, windowSeconds: 60, failClosed: false });
  const custom = resolveGlobalRateLimitPolicy({
    GLOBAL_RATE_LIMIT_ENABLED: 'true',
    GLOBAL_RATE_LIMIT_MAX: '10',
    GLOBAL_RATE_LIMIT_WINDOW_SEC: '30',
    GLOBAL_RATE_LIMIT_FAIL_CLOSED: 'true',
  });
  assert.deepEqual(custom, { enabled: true, max: 10, windowSeconds: 30, failClosed: true });
  for (const [key, bad] of [
    ['GLOBAL_RATE_LIMIT_MAX', '0'],
    ['GLOBAL_RATE_LIMIT_MAX', '100001'],
    ['GLOBAL_RATE_LIMIT_WINDOW_SEC', '0'],
    ['GLOBAL_RATE_LIMIT_WINDOW_SEC', '3601'],
    ['GLOBAL_RATE_LIMIT_FAIL_CLOSED', 'enabled'],
    ['GLOBAL_RATE_LIMIT_ENABLED', 'on'],
  ]) {
    assert.throws(() => resolveGlobalRateLimitPolicy({ [key]: bad }));
  }
});

test('the safe header catalog never emits CSP or CORP by default', () => {
  const names = Object.keys(SECURITY_HEADERS_CATALOG);
  assert.ok(names.includes('X-Content-Type-Options'));
  assert.ok(names.includes('X-Frame-Options'));
  assert.equal(names.some((name) => /content-security-policy|cross-origin-resource-policy/iu.test(name)), false);
  assert.equal(SECURITY_HEADERS_CATALOG['X-Content-Type-Options'], 'nosniff');
});

test('HSTS only for real HTTPS requests; health is exempt; auth/setup are no-store', () => {
  assert.equal(isSecureRequest(fakeRequest('/', { headers: { 'x-forwarded-proto': 'https' } })), true);
  assert.equal(
    isSecureRequest(fakeRequest('/', { headers: { 'x-forwarded-proto': 'https, http' } })),
    true,
  );
  assert.equal(isSecureRequest(fakeRequest('/', { headers: { 'x-forwarded-proto': 'http' } })), false);
  assert.equal(isSecureRequest(fakeRequest('/', { encrypted: true })), true);
  assert.equal(isSecureRequest(fakeRequest()), false);

  for (const url of ['/health', '/health/ready', '/backend/health/live', '/backend/health/ready?x=1']) {
    assert.equal(isGlobalRateLimitExempt(url), true, url);
  }
  for (const url of ['/backend/equipment', '/backend/healthcheck', undefined]) {
    assert.equal(isGlobalRateLimitExempt(url), false, String(url));
  }
  for (const url of ['/backend/auth/login', '/backend/setup/initialize']) {
    assert.equal(isNoStorePath(url), true, url);
  }
  assert.equal(isNoStorePath('/backend/equipment'), false);
});

test('rate-limit keys are hashed, stable and never expose the client IP', () => {
  const a = buildGlobalRateLimitKey(fakeRequest('/', { ip: '203.0.113.7' }));
  const b = buildGlobalRateLimitKey(fakeRequest('/other', { ip: '203.0.113.7' }));
  const c = buildGlobalRateLimitKey(fakeRequest('/', { ip: '198.51.100.9' }));
  assert.equal(a, b, 'the window key must not depend on the URL');
  assert.notEqual(a, c);
  assert.ok(a.startsWith(GLOBAL_RATE_LIMIT_KEY_PREFIX));
  assert.equal(a.includes('203.0.113.7'), false);
});

test('applySecurityHeaders removes X-Powered-By and sets no-store on auth paths', () => {
  const { res, headers } = fakeResponse();
  applySecurityHeaders(
    fakeRequest('/backend/auth/login', { headers: { 'x-forwarded-proto': 'https' } }),
    res,
    enabledHeaders,
  );
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('referrer-policy'), 'no-referrer');
  assert.equal(headers.get('permissions-policy'), SECURITY_HEADERS_CATALOG['Permissions-Policy']);
  assert.equal(headers.has('x-powered-by'), false);
  assert.equal(headers.get(HSTS_HEADER.toLowerCase()), `max-age=${DEFAULT_HSTS_MAX_AGE_SECONDS}`);
  assert.equal(headers.get('cache-control'), 'no-store');
});

test('plain HTTP gets no HSTS; disabled policy emits nothing', () => {
  const plain = fakeResponse();
  applySecurityHeaders(fakeRequest('/backend/equipment'), plain.res, enabledHeaders);
  assert.equal(plain.headers.has(HSTS_HEADER.toLowerCase()), false);
  assert.equal(plain.headers.has('cache-control'), false);

  const off = fakeResponse();
  applySecurityHeaders(fakeRequest('/backend/auth/login'), off.res, { enabled: false, hstsMaxAgeSeconds: 0 });
  assert.equal(off.headers.has('x-content-type-options'), false);
  assert.equal(off.headers.get('x-powered-by'), 'Express');
});

test('securityHeadersMiddleware always calls next, even when disabled', () => {
  const { res } = fakeResponse();
  let called = 0;
  securityHeadersMiddleware({ enabled: false, hstsMaxAgeSeconds: 0 })(fakeRequest(), res, () => {
    called += 1;
  });
  assert.equal(called, 1);
});

const rateLimit = (overrides: Partial<GlobalRateLimitPolicy> = {}): GlobalRateLimitPolicy => ({
  enabled: true,
  max: 2,
  windowSeconds: 60,
  failClosed: false,
  ...overrides,
});

test('global rate limit allows under the cap and blocks with 429 + Retry-After', async () => {
  let count = 0;
  const middleware = globalRateLimitMiddleware(rateLimit(), async () => {
    count += 1;
    return count;
  });
  const first = fakeResponse();
  let nextCalls = 0;
  await middleware(fakeRequest(), first.res, () => {
    nextCalls += 1;
  });
  assert.equal(first.headers.get('ratelimit-limit'), 2);
  assert.equal(first.headers.get('ratelimit-remaining'), 1);
  assert.equal(nextCalls, 1);

  await middleware(fakeRequest(), fakeResponse().res, () => {
    nextCalls += 1;
  });
  const blocked = fakeResponse();
  await middleware(fakeRequest(), blocked.res, () => {
    nextCalls += 1;
  });
  assert.equal(blocked.status(), 429);
  assert.equal(blocked.headers.get('retry-after'), 60);
  assert.equal(nextCalls, 2);
  assert.match(String(blocked.body()), /429/u);
});

test('health endpoints and disabled policy bypass the counter entirely', async () => {
  let calls = 0;
  const middleware = globalRateLimitMiddleware(rateLimit(), async () => {
    calls += 1;
    return 999;
  });
  let nextCalls = 0;
  await middleware(fakeRequest('/backend/health/ready'), fakeResponse().res, () => {
    nextCalls += 1;
  });
  assert.equal(calls, 0);
  assert.equal(nextCalls, 1);

  const off = globalRateLimitMiddleware(rateLimit({ enabled: false }), async () => {
    calls += 1;
    return 999;
  });
  await off(fakeRequest('/backend/equipment'), fakeResponse().res, () => {
    nextCalls += 1;
  });
  assert.equal(calls, 0);
  assert.equal(nextCalls, 2);
});

test('Redis failure honours fail-open / fail-closed without changing other decisions', async () => {
  const failing = async () => {
    throw new Error('ECONNREFUSED 127.0.0.1:6379');
  };
  const open = fakeResponse();
  let openNext = 0;
  await globalRateLimitMiddleware(rateLimit(), failing)(fakeRequest(), open.res, () => {
    openNext += 1;
  });
  assert.equal(openNext, 1);
  assert.equal(open.status(), 200);

  const closed = fakeResponse();
  let closedNext = 0;
  await globalRateLimitMiddleware(rateLimit({ failClosed: true }), failing)(
    fakeRequest(),
    closed.res,
    () => {
      closedNext += 1;
    },
  );
  assert.equal(closed.status(), 503);
  assert.equal(closedNext, 0);
  assert.match(String(closed.body()), /503/u);
});
