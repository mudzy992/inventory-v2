import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { RedisRateLimitGuard } from './redis-rate-limit.guard';
import { RedisService } from './redis.service';

const RATE_LIMIT_ENV_NAMES = [
  'RATE_LIMIT_LOGIN_MAX',
  'RATE_LIMIT_LOGIN_WINDOW_SEC',
  'RATE_LIMIT_LOGIN_FAIL_CLOSED',
] as const;

type RateLimitEnvironment = Partial<Record<(typeof RATE_LIMIT_ENV_NAMES)[number], string>>;

const withRateLimitEnvironment = async (
  values: RateLimitEnvironment,
  run: () => Promise<void>,
): Promise<void> => {
  const previous = new Map(RATE_LIMIT_ENV_NAMES.map((name) => [name, process.env[name]]));
  for (const name of RATE_LIMIT_ENV_NAMES) delete process.env[name];
  Object.assign(process.env, values);

  try {
    await run();
  } finally {
    for (const name of RATE_LIMIT_ENV_NAMES) {
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

const makeGuard = (increment: (key: string, windowSeconds: number) => Promise<number>) =>
  new RedisRateLimitGuard({ incrementRateLimitCounter: increment } as unknown as RedisService);

test('rate-limit guard uses client IP/window and rejects requests over the configured limit', async () => {
  await withRateLimitEnvironment(
    { RATE_LIMIT_LOGIN_MAX: '2', RATE_LIMIT_LOGIN_WINDOW_SEC: '30' },
    async () => {
      const calls: Array<{ key: string; windowSeconds: number }> = [];
      const guard = makeGuard(async (key, windowSeconds) => {
        calls.push({ key, windowSeconds });
        return 3;
      });

      await assert.rejects(guard.canActivate(makeContext('203.0.113.8')), (error: unknown) =>
        error instanceof HttpException && error.getStatus() === 429,
      );
      assert.deepEqual(calls, [{ key: 'ratelimit:login:203.0.113.8', windowSeconds: 30 }]);
    },
  );
});

test('rate-limit guard preserves fail-open default when Redis is unavailable', async () => {
  await withRateLimitEnvironment({}, async () => {
    const guard = makeGuard(async () => {
      throw new Error('Redis offline');
    });
    assert.equal(await guard.canActivate(makeContext('203.0.113.9')), true);
  });
});

test('rate-limit guard can fail closed with a service-unavailable response', async () => {
  await withRateLimitEnvironment({ RATE_LIMIT_LOGIN_FAIL_CLOSED: 'true' }, async () => {
    const guard = makeGuard(async () => {
      throw new Error('Redis offline');
    });
    await assert.rejects(guard.canActivate(makeContext('203.0.113.10')), (error: unknown) =>
      error instanceof ServiceUnavailableException && error.getStatus() === 503,
    );
  });
});

test('rate-limit guard rejects malformed integer or outage-policy configuration', async () => {
  for (const [name, value] of [
    ['RATE_LIMIT_LOGIN_MAX', '10junk'],
    ['RATE_LIMIT_LOGIN_WINDOW_SEC', '-1'],
    ['RATE_LIMIT_LOGIN_FAIL_CLOSED', 'yes'],
  ] as const) {
    await withRateLimitEnvironment({ [name]: value }, async () => {
      assert.throws(() => makeGuard(async () => 1), new RegExp(name, 'u'));
    });
  }
});
