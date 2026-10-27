import assert from 'node:assert/strict';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { describe, it } from 'node:test';
import { PublicEquipmentRateLimitGuard } from '../modules/public-equipment/public-equipment-rate-limit.guard';
import {
  rateLimitMetricsRegistry,
  type RateLimitMetricsSnapshot,
} from './rate-limit-metrics.registry';
import { RedisRateLimitGuard } from './redis-rate-limit.guard';
import { RedisService } from './redis.service';

interface CapturedLog {
  level: 'log' | 'warn' | 'error';
  line: string;
}

const at = new Date('2026-10-27T11:00:00.000Z');
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

const captureLogs = (guard: RedisRateLimitGuard): CapturedLog[] => {
  const logs: CapturedLog[] = [];
  (guard as unknown as { logger: Record<string, (line: string) => void> }).logger = {
    log: (line: string) => logs.push({ level: 'log', line }),
    warn: (line: string) => logs.push({ level: 'warn', line }),
    error: (line: string) => logs.push({ level: 'error', line }),
  };
  return logs;
};

const failingRedis = (): RedisService =>
  ({
    incrementRateLimitCounter: async (): Promise<number> => {
      throw new Error('password=ci-secret ECONNREFUSED ratelimit:login:203.0.113.77');
    },
  }) as unknown as RedisService;

const countingRedis = (from = 1): RedisService => {
  let count = from - 1;
  return {
    incrementRateLimitCounter: async (): Promise<number> => {
      count += 1;
      return count;
    },
  } as unknown as RedisService;
};

describe('RedisRateLimitGuard structured decision metrics', () => {
  it('records allowed and exceeded decisions without logging per-request data', async () => {
    rateLimitMetricsRegistry.reset(at);
    await withEnv({ RATE_LIMIT_LOGIN_MAX: '2' }, async () => {
      const guard = new RedisRateLimitGuard(countingRedis());
      const logs = captureLogs(guard);
      assert.equal(await guard.canActivate(makeContext('203.0.113.5')), true);
      assert.equal(await guard.canActivate(makeContext('203.0.113.5')), true);
      await assert.rejects(
        guard.canActivate(makeContext('203.0.113.5')),
        (error: unknown) => error instanceof HttpException && error.getStatus() === 429,
      );
      assert.equal(logs.length, 0, 'normal and 429 decisions must not flood the log');
    });
    const snapshot: RateLimitMetricsSnapshot = rateLimitMetricsRegistry.snapshot(at);
    assert.equal(snapshot.byOutcome.allowed, 2);
    assert.equal(snapshot.byOutcome.exceeded, 1);
    assert.equal(snapshot.byPolicy.login, 3);
    assert.equal(snapshot.consecutiveFailures, 0);
  });

  it('emits a redacted structured fail-open line and records the outage', async () => {
    rateLimitMetricsRegistry.reset(at);
    await withEnv({}, async () => {
      const guard = new RedisRateLimitGuard(failingRedis());
      const logs = captureLogs(guard);
      assert.equal(await guard.canActivate(makeContext('203.0.113.77')), true);
      assert.equal(logs.length, 1);
      assert.equal(logs[0].level, 'warn');
      const line = JSON.parse(logs[0].line) as Record<string, unknown>;
      assert.equal(line.event, 'rate_limit_check_failed');
      assert.equal(line.policy, 'login');
      assert.equal(line.mode, 'fail_open');
      assert.equal(line.reason, 'connection');
      assert.ok(!logs[0].line.includes('ci-secret'));
      assert.ok(!logs[0].line.includes('203.0.113.77'));
      assert.ok(!logs[0].line.includes('ratelimit:login'));
    });
    const snapshot = rateLimitMetricsRegistry.snapshot(at);
    assert.equal(snapshot.byOutcome.fail_open, 1);
    assert.equal(snapshot.consecutiveFailures, 1);
    assert.equal(snapshot.byFailureReason.connection, 1);
  });

  it('emits an error-level line and rejects when the policy is fail-closed', async () => {
    rateLimitMetricsRegistry.reset(at);
    await withEnv({ RATE_LIMIT_LOGIN_FAIL_CLOSED: 'true' }, async () => {
      const guard = new RedisRateLimitGuard(failingRedis());
      const logs = captureLogs(guard);
      await assert.rejects(
        guard.canActivate(makeContext('203.0.113.77')),
        (error: unknown) =>
          error instanceof ServiceUnavailableException && error.getStatus() === 503,
      );
      assert.equal(logs.length, 1);
      assert.equal(logs[0].level, 'error');
      assert.equal(JSON.parse(logs[0].line).mode, 'fail_closed');
    });
    const snapshot = rateLimitMetricsRegistry.snapshot(at);
    assert.equal(snapshot.byOutcome.fail_closed, 1);
    assert.equal(snapshot.consecutiveFailures, 1);
  });

  it('uses a separate low-cardinality policy label for public equipment', async () => {
    rateLimitMetricsRegistry.reset(at);
    await withEnv({ RATE_LIMIT_PUBLIC_EQUIPMENT_MAX: '1' }, async () => {
      const guard = new PublicEquipmentRateLimitGuard(countingRedis(2));
      const logs = captureLogs(guard);
      await assert.rejects(
        guard.canActivate(makeContext('203.0.113.90')),
        (error: unknown) => error instanceof HttpException && error.getStatus() === 429,
      );
      assert.equal(logs.length, 0);
    });
    assert.equal(rateLimitMetricsRegistry.snapshot(at).byPolicy.public_equipment, 1);
  });

  it('a success after an outage clears the consecutive failure streak', async () => {
    rateLimitMetricsRegistry.reset(at);
    await withEnv({}, async () => {
      const broken = new RedisRateLimitGuard(failingRedis());
      captureLogs(broken);
      await broken.canActivate(makeContext('203.0.113.1'));
      await broken.canActivate(makeContext('203.0.113.1'));
      assert.equal(rateLimitMetricsRegistry.snapshot(at).consecutiveFailures, 2);

      const healthy = new RedisRateLimitGuard(countingRedis());
      captureLogs(healthy);
      assert.equal(await healthy.canActivate(makeContext('203.0.113.1')), true);
    });
    const snapshot = rateLimitMetricsRegistry.snapshot(at);
    assert.equal(snapshot.consecutiveFailures, 0);
    assert.equal(snapshot.maxConsecutiveFailures, 2);
    assert.equal(snapshot.totalFailures, 2);
  });
});
