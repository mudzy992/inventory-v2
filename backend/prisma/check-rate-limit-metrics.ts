import assert from 'node:assert/strict';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Redis from 'ioredis';
import { PublicEquipmentRateLimitGuard } from '../src/modules/public-equipment/public-equipment-rate-limit.guard';
import { RateLimitMetricsService } from '../src/modules/health/rate-limit-metrics.service';
import { withTimeout } from '../src/modules/health/utils/redis-metrics.util';
import { evaluateRateLimitMetrics } from '../src/modules/health/utils/rate-limit-metrics.util';
import { SETTINGS_REGISTRY } from '../src/modules/settings/settings.registry';
import type { SettingsService } from '../src/modules/settings/settings.service';
import { RedisRateLimitGuard } from '../src/redis/redis-rate-limit.guard';
import { rateLimitMetricsRegistry } from '../src/redis/rate-limit-metrics.registry';
import { RedisService } from '../src/redis/redis.service';

interface CapturedLog {
  level: 'log' | 'warn' | 'error';
  line: string;
}

const ENV_NAMES = [
  'RATE_LIMIT_LOGIN_MAX',
  'RATE_LIMIT_LOGIN_WINDOW_SEC',
  'RATE_LIMIT_LOGIN_FAIL_CLOSED',
  'RATE_LIMIT_PUBLIC_EQUIPMENT_MAX',
  'RATE_LIMIT_PUBLIC_EQUIPMENT_WINDOW_SEC',
  'RATE_LIMIT_PUBLIC_EQUIPMENT_FAIL_CLOSED',
] as const;

const withEnv = async (values: Record<string, string>, run: () => Promise<void>): Promise<void> => {
  const previous = new Map(ENV_NAMES.map((name) => [name, process.env[name]]));
  for (const name of ENV_NAMES) delete process.env[name];
  Object.assign(process.env, values);
  try {
    await run();
  } finally {
    for (const name of ENV_NAMES) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
};

const makeContext = (ip: string): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  }) as unknown as ExecutionContext;

const captureLogs = (guard: RedisRateLimitGuard, logs: CapturedLog[]): void => {
  (guard as unknown as { logger: Record<string, (line: string) => void> }).logger = {
    log: (line: string) => logs.push({ level: 'log', line }),
    warn: (line: string) => logs.push({ level: 'warn', line }),
    error: (line: string) => logs.push({ level: 'error', line }),
  };
};

const createMetricsService = (
  values: Record<string, number> = {},
): { service: RateLimitMetricsService; logs: CapturedLog[] } => {
  const settings = {
    getNumberValue: async (key: string, fallback: number): Promise<number> =>
      values[key] ?? fallback,
  } as unknown as SettingsService;
  const service = new RateLimitMetricsService(settings);
  const logs: CapturedLog[] = [];
  (service as unknown as { logger: Record<string, (line: string) => void> }).logger = {
    log: (line: string) => logs.push({ level: 'log', line }),
    warn: (line: string) => logs.push({ level: 'warn', line }),
    error: (line: string) => logs.push({ level: 'error', line }),
  };
  return { service, logs };
};

const main = async (): Promise<void> => {
  const host = process.env.REDIS_HOST ?? '127.0.0.1';
  const port = Number(process.env.REDIS_PORT ?? 6379);
  if (
    process.env.NODE_ENV !== 'test' ||
    !['localhost', '127.0.0.1'].includes(host) ||
    !Number.isSafeInteger(port)
  ) {
    throw new Error('Rate-limit metrics integration check is restricted to the local CI Redis service');
  }

  const keyPrefix = `ci:rate-limit-metrics:${randomUUID()}:`;
  const client = new Redis({
    host,
    port,
    keyPrefix,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  const redisService = new RedisService(client);
  const failingRedis = {
    incrementRateLimitCounter: async (): Promise<number> => {
      throw new Error('password=ci-secret ECONNREFUSED ratelimit:login:203.0.113.77');
    },
  } as unknown as RedisService;

  const loginIp = '203.0.113.20';
  const publicIp = '203.0.113.21';
  const recoveryIp = '203.0.113.22';
  const keys = [
    `ratelimit:login:${loginIp}`,
    `ratelimit:public-equipment:${publicIp}`,
    `ratelimit:login:${recoveryIp}`,
  ];
  const guardLogs: CapturedLog[] = [];
  rateLimitMetricsRegistry.reset();

  try {
    await client.connect();
    if (client.status !== 'ready') {
      await withTimeout(
        new Promise<void>((done) => client.once('ready', () => done())),
        5_000,
        'Redis ready event',
      );
    }
    assert.equal(await client.ping(), 'PONG');

    // Real RedisService + Lua counter: allowed, allowed, then 429.
    await withEnv(
      { RATE_LIMIT_LOGIN_MAX: '2', RATE_LIMIT_LOGIN_WINDOW_SEC: '60' },
      async () => {
        const guard = new RedisRateLimitGuard(redisService);
        captureLogs(guard, guardLogs);
        assert.equal(await guard.canActivate(makeContext(loginIp)), true);
        assert.equal(await guard.canActivate(makeContext(loginIp)), true);
        await assert.rejects(
          guard.canActivate(makeContext(loginIp)),
          (error: unknown) => error instanceof HttpException && error.getStatus() === 429,
        );
      },
    );

    await withEnv({ RATE_LIMIT_PUBLIC_EQUIPMENT_MAX: '60' }, async () => {
      const guard = new PublicEquipmentRateLimitGuard(redisService);
      captureLogs(guard, guardLogs);
      assert.equal(await guard.canActivate(makeContext(publicIp)), true);
    });

    // Outage: two fail-open decisions, then one fail-closed rejection.
    await withEnv({}, async () => {
      const guard = new RedisRateLimitGuard(failingRedis);
      captureLogs(guard, guardLogs);
      assert.equal(await guard.canActivate(makeContext(loginIp)), true);
      assert.equal(await guard.canActivate(makeContext(loginIp)), true);
    });
    await withEnv({ RATE_LIMIT_LOGIN_FAIL_CLOSED: 'true' }, async () => {
      const guard = new RedisRateLimitGuard(failingRedis);
      captureLogs(guard, guardLogs);
      await assert.rejects(
        guard.canActivate(makeContext(loginIp)),
        (error: unknown) =>
          error instanceof ServiceUnavailableException && error.getStatus() === 503,
      );
    });

    assert.equal(guardLogs.length, 3);
    assert.deepEqual(
      guardLogs.map(({ level }) => level),
      ['warn', 'warn', 'error'],
    );
    for (const { line } of guardLogs) {
      const event = JSON.parse(line) as Record<string, unknown>;
      assert.equal(event.event, 'rate_limit_check_failed');
      assert.equal(event.reason, 'connection');
      assert.ok(!line.includes('ci-secret'));
      assert.ok(!line.includes('203.0.113.77'));
      assert.ok(!line.includes('ratelimit:login'));
    }

    const thresholds = {
      warnFailOpenCount: 2,
      warnConsecutiveFailures: 3,
      warnExceededCount: 1,
    };
    const { service, logs } = createMetricsService({
      'rate_limit.metrics.warn_fail_open_count': thresholds.warnFailOpenCount,
      'rate_limit.metrics.warn_consecutive_failures': thresholds.warnConsecutiveFailures,
      'rate_limit.metrics.warn_exceeded_count': thresholds.warnExceededCount,
    });
    const snapshot = await service.reportMetrics();
    assert.ok(snapshot, 'reportMetrics must return a snapshot');
    assert.equal(snapshot.intervalDecisions, 7);
    assert.equal(snapshot.byOutcome.allowed, 3);
    assert.equal(snapshot.byOutcome.exceeded, 1);
    assert.equal(snapshot.byOutcome.fail_open, 2);
    assert.equal(snapshot.byOutcome.fail_closed, 1);
    assert.equal(snapshot.byPolicy.login, 6);
    assert.equal(snapshot.byPolicy.public_equipment, 1);
    assert.equal(snapshot.byFailureReason.connection, 3);
    assert.equal(snapshot.consecutiveFailures, 3);
    assert.equal(snapshot.maxConsecutiveFailures, 3);
    assert.equal(snapshot.totalFailures, 3);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'warn');

    const line = JSON.parse(logs[0].line) as Record<string, unknown>;
    assert.equal(line.event, 'rate_limit_metrics');
    assert.equal(line.level, 'warn');
    assert.deepEqual(line.reasons, [
      'fail_closed',
      'sustained_outage',
      'fail_open_burst',
      'exceeded_burst',
    ]);
    assert.deepEqual(evaluateRateLimitMetrics(snapshot, thresholds).reasons, line.reasons);
    assert.ok(!logs[0].line.includes('ci-secret'));
    assert.ok(!logs[0].line.includes('203.0.113.'));
    assert.ok(!logs[0].line.includes('ratelimit:'));

    // A real successful counter check clears the sustained-outage streak.
    await withEnv({}, async () => {
      const guard = new RedisRateLimitGuard(redisService);
      captureLogs(guard, guardLogs);
      assert.equal(await guard.canActivate(makeContext(recoveryIp)), true);
    });
    const quiet = createMetricsService();
    const quietSnapshot = await quiet.service.reportMetrics();
    assert.ok(quietSnapshot);
    assert.equal(quietSnapshot.intervalDecisions, 1);
    assert.equal(quietSnapshot.consecutiveFailures, 0);
    assert.equal(quietSnapshot.totalFailures, 3);
    assert.equal(quiet.logs.length, 1);
    assert.equal(quiet.logs[0].level, 'log');
    assert.deepEqual(JSON.parse(quiet.logs[0].line).reasons, []);

    // Configuration wiring: structured guard logs, health module reporter,
    // validated settings defaults and the trust-proxy prerequisite.
    const guardSource = readFileSync(resolve('src/redis/redis-rate-limit.guard.ts'), 'utf8');
    assert.ok(guardSource.includes('rate_limit_check_failed'));
    assert.ok(!guardSource.includes('String(err)'));
    const healthModuleSource = readFileSync(
      resolve('src/modules/health/health.module.ts'),
      'utf8',
    );
    assert.ok(healthModuleSource.includes('RateLimitMetricsService'));
    const mainSource = readFileSync(resolve('src/main.ts'), 'utf8');
    assert.ok(mainSource.includes("app.set('trust proxy', 1)"));
    const expectedSettings: Record<string, number> = {
      'rate_limit.metrics.warn_fail_open_count': 5,
      'rate_limit.metrics.warn_consecutive_failures': 3,
      'rate_limit.metrics.warn_exceeded_count': 25,
    };
    for (const [key, defaultValue] of Object.entries(expectedSettings)) {
      const definition = SETTINGS_REGISTRY.find((entry) => entry.key === key);
      assert.ok(definition, `missing setting definition: ${key}`);
      assert.equal(definition.defaultValue, defaultValue);
      assert.equal(definition.valueType, 'number');
      assert.equal(definition.scope, 'private');
      assert.ok(definition.minValue !== undefined && definition.maxValue !== undefined);
    }

    console.log(
      `Verified rate-limit metrics: decisions=${snapshot.intervalDecisions}, ` +
        `failures=${snapshot.intervalFailures}, streak=${snapshot.consecutiveFailures}, level=${logs[0].level}.`,
    );
  } finally {
    try {
      if (client.status === 'ready') await client.del(...keys);
    } catch {
      // Cleanup is best-effort; the CI Redis key prefix is unique per run.
    } finally {
      client.disconnect();
      rateLimitMetricsRegistry.reset();
    }
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
