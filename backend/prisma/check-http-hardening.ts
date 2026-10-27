import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import {
  DEFAULT_HSTS_MAX_AGE_SECONDS,
  HSTS_HEADER,
  SECURITY_HEADERS_CATALOG,
  globalRateLimitMiddleware,
  resolveGlobalRateLimitPolicy,
  resolveSecurityHeadersPolicy,
  securityHeadersMiddleware,
  type GlobalRateLimitPolicy,
  type RateLimitCounter,
  type SecurityHeadersPolicy,
} from '../src/common/http/http-hardening.util';

/**
 * Verifies the HTTP hardening policy statically AND over a real node:http
 * server with real fetch() requests. No Nest app, Redis or database needed:
 * the counter is an in-memory stand-in for the already-tested atomic Lua
 * counter (check-redis-rate-limit.ts covers the Lua script itself).
 */

const ROOT = resolve('.');
const REPO = resolve(ROOT, '..');

interface Running {
  base: string;
  close: () => Promise<void>;
}

const memoryCounter = (): RateLimitCounter => {
  const counts = new Map<string, number>();
  return async (key: string) => {
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    return next;
  };
};

const start = async (options: {
  headers?: SecurityHeadersPolicy;
  rate?: GlobalRateLimitPolicy;
  counter?: RateLimitCounter;
  ip?: string;
}): Promise<Running> => {
  const headers = options.headers ?? resolveSecurityHeadersPolicy({});
  const rate = options.rate ?? resolveGlobalRateLimitPolicy({});
  const counter = options.counter ?? memoryCounter();
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    Object.assign(req, { ip: options.ip ?? '203.0.113.7' });
    // Express adds this before middleware runs; prove our layer removes it.
    res.setHeader('X-Powered-By', 'Express');
    securityHeadersMiddleware(headers)(req, res, () => {
      void globalRateLimitMiddleware(rate, counter)(req, res, () => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('ok');
      }).catch(() => {
        res.statusCode = 500;
        res.end('middleware error');
      });
    });
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolveClose) => {
        server.close(() => resolveClose());
      }),
  };
};

const staticChecks = (): void => {
  const main = readFileSync(resolve(ROOT, 'src/main.ts'), 'utf8');
  for (const expected of [
    'securityHeadersMiddleware(',
    'globalRateLimitMiddleware(',
    "disable('x-powered-by')",
    'resolveSecurityHeadersPolicy(process.env)',
    'resolveGlobalRateLimitPolicy(process.env)',
    'http_hardening_config',
    "app.set('trust proxy', 1)",
    'resolveCorsOriginPolicy(',
    'app.get(RedisService)',
    'incrementRateLimitCounter(',
  ]) {
    assert.ok(main.includes(expected), `main.ts must wire ${expected}`);
  }

  const headerNames = Object.keys(SECURITY_HEADERS_CATALOG);
  assert.ok(headerNames.length >= 5);
  assert.equal(
    headerNames.some((name) => /content-security-policy|cross-origin-resource-policy/iu.test(name)),
    false,
    'CSP/CORP remain an explicit owner decision',
  );
  assert.equal(resolveSecurityHeadersPolicy({}).enabled, true);
  assert.equal(resolveGlobalRateLimitPolicy({}).enabled, false, 'global limit stays opt-in');

  const flags = [
    'SECURITY_HEADERS_ENABLED',
    'HSTS_MAX_AGE_SECONDS',
    'GLOBAL_RATE_LIMIT_ENABLED',
    'GLOBAL_RATE_LIMIT_MAX',
    'GLOBAL_RATE_LIMIT_WINDOW_SEC',
    'GLOBAL_RATE_LIMIT_FAIL_CLOSED',
  ];
  const envExample = readFileSync(resolve(REPO, '.env.example'), 'utf8');
  assert.match(envExample, /GLOBAL_RATE_LIMIT_ENABLED=false/u);
  for (const file of ['.env.example', 'docker-compose.yml', 'docker-compose.prod.yml']) {
    const source = readFileSync(resolve(REPO, file), 'utf8');
    for (const flag of flags) {
      assert.ok(source.includes(flag), `${file} must expose ${flag}`);
    }
  }
  const guide = readFileSync(resolve(REPO, 'docs/http-hardening.md'), 'utf8');
  for (const keyword of ['CSP', 'HSTS', 'health', 'fail-open', 'opt-in']) {
    assert.ok(guide.includes(keyword), `http hardening guide must document ${keyword}`);
  }
};

const liveChecks = async (): Promise<void> => {
  // 1. Header catalogue, X-Powered-By removal, HSTS only over HTTPS, no-store.
  const primary = await start({ rate: resolveGlobalRateLimitPolicy({ GLOBAL_RATE_LIMIT_ENABLED: 'false' }) });
  try {
    const plain = await fetch(`${primary.base}/backend/equipment`);
    assert.equal(plain.status, 200);
    for (const [name, value] of Object.entries(SECURITY_HEADERS_CATALOG)) {
      assert.equal(plain.headers.get(name.toLowerCase()), value, `missing header ${name}`);
    }
    assert.equal(plain.headers.get('x-powered-by'), null);
    assert.equal(plain.headers.get(HSTS_HEADER.toLowerCase()), null, 'no HSTS on plain HTTP');

    const https = await fetch(`${primary.base}/backend/auth/login`, {
      headers: { 'x-forwarded-proto': 'https' },
    });
    assert.equal(
      https.headers.get(HSTS_HEADER.toLowerCase()),
      `max-age=${DEFAULT_HSTS_MAX_AGE_SECONDS}`,
    );
    assert.equal(https.headers.get('cache-control'), 'no-store');
    assert.equal(https.headers.get('pragma'), 'no-cache');
  } finally {
    await primary.close();
  }

  // 2. Health is always exempt; non-health requests hit the 429 boundary.
  const limited = await start({
    rate: {
      enabled: true,
      max: 3,
      windowSeconds: 60,
      failClosed: false,
    },
  });
  try {
    for (let index = 0; index < 6; index += 1) {
      const response = await fetch(`${limited.base}/backend/health/ready`);
      assert.equal(response.status, 200, 'healthcheck must never be limited');
    }
    const statuses: number[] = [];
    let retryAfter: string | null = null;
    for (let index = 0; index < 4; index += 1) {
      const response = await fetch(`${limited.base}/backend/equipment`);
      statuses.push(response.status);
      retryAfter = response.headers.get('retry-after');
    }
    assert.deepEqual(statuses, [200, 200, 200, 429]);
    assert.equal(retryAfter, '60');
  } finally {
    await limited.close();
  }

  // 3. Disabling the policy really emits nothing.
  const off = await start({
    headers: { enabled: false, hstsMaxAgeSeconds: 0 },
    rate: resolveGlobalRateLimitPolicy({}),
  });
  try {
    const response = await fetch(`${off.base}/backend/equipment`, {
      headers: { 'x-forwarded-proto': 'https' },
    });
    assert.equal(response.headers.get('x-content-type-options'), null);
    assert.equal(response.headers.get(HSTS_HEADER.toLowerCase()), null);
    assert.equal(response.headers.get('x-powered-by'), 'Express');
  } finally {
    await off.close();
  }

  // 4. Redis outage: fail-open vs fail-closed.
  const failing: RateLimitCounter = async () => {
    throw new Error('ECONNREFUSED 127.0.0.1:6379');
  };
  const failOpen = await start({
    counter: failing,
    rate: { enabled: true, max: 5, windowSeconds: 60, failClosed: false },
  });
  const failClosed = await start({
    counter: failing,
    rate: { enabled: true, max: 5, windowSeconds: 60, failClosed: true },
  });
  try {
    assert.equal((await fetch(`${failOpen.base}/backend/equipment`)).status, 200);
    assert.equal((await fetch(`${failClosed.base}/backend/equipment`)).status, 503);
  } finally {
    await failOpen.close();
    await failClosed.close();
  }
};

const main = async (): Promise<void> => {
  staticChecks();
  if (process.argv.includes('--static')) {
    console.log('HTTP hardening contract passed (static policy; live HTTP part skipped).');
    return;
  }
  await liveChecks();
  console.log(
    'HTTP hardening check passed (5 safe headers, conditional HSTS, no X-Powered-By, no-store auth/setup, health exempt, 429 boundary, fail-open/closed).',
  );
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
