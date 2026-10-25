import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { ExecutionContext } from '@nestjs/common';
import { AuthController } from '../modules/auth/auth.controller';
import { PublicEquipmentController } from '../modules/public-equipment/public-equipment.controller';
import { PublicEquipmentRateLimitGuard } from '../modules/public-equipment/public-equipment-rate-limit.guard';
import { RedisRateLimitGuard } from './redis-rate-limit.guard';
import { RedisService } from './redis.service';

const RATE_LIMIT_ENV_NAMES = [
  'RATE_LIMIT_LOGIN_MAX',
  'RATE_LIMIT_LOGIN_WINDOW_SEC',
  'RATE_LIMIT_LOGIN_FAIL_CLOSED',
  'RATE_LIMIT_PUBLIC_EQUIPMENT_MAX',
  'RATE_LIMIT_PUBLIC_EQUIPMENT_WINDOW_SEC',
  'RATE_LIMIT_PUBLIC_EQUIPMENT_FAIL_CLOSED',
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

test('public equipment rate limit uses an independent configurable IP bucket', async () => {
  await withRateLimitEnvironment(
    {
      RATE_LIMIT_PUBLIC_EQUIPMENT_MAX: '2',
      RATE_LIMIT_PUBLIC_EQUIPMENT_WINDOW_SEC: '30',
    },
    async () => {
      const calls: Array<{ key: string; windowSeconds: number }> = [];
      const guard = new PublicEquipmentRateLimitGuard({
        incrementRateLimitCounter: async (key: string, windowSeconds: number) => {
          calls.push({ key, windowSeconds });
          return 3;
        },
      } as unknown as RedisService);

      await assert.rejects(guard.canActivate(makeContext('203.0.113.11')), (error: unknown) =>
        error instanceof HttpException && error.getStatus() === 429,
      );
      assert.deepEqual(calls, [
        { key: 'ratelimit:public-equipment:203.0.113.11', windowSeconds: 30 },
      ]);
    },
  );
});

test('public equipment rate-limit configuration is validated and can fail closed', async () => {
  for (const [name, value] of [
    ['RATE_LIMIT_PUBLIC_EQUIPMENT_MAX', '2x'],
    ['RATE_LIMIT_PUBLIC_EQUIPMENT_WINDOW_SEC', '0'],
    ['RATE_LIMIT_PUBLIC_EQUIPMENT_FAIL_CLOSED', 'maybe'],
  ] as const) {
    await withRateLimitEnvironment({ [name]: value }, async () => {
      assert.throws(
        () => new PublicEquipmentRateLimitGuard({} as RedisService),
        new RegExp(name, 'u'),
      );
    });
  }

  await withRateLimitEnvironment(
    { RATE_LIMIT_PUBLIC_EQUIPMENT_FAIL_CLOSED: 'true' },
    async () => {
      const guard = new PublicEquipmentRateLimitGuard({
        incrementRateLimitCounter: async () => {
          throw new Error('Redis offline');
        },
      } as unknown as RedisService);
      await assert.rejects(guard.canActivate(makeContext('203.0.113.12')), (error: unknown) =>
        error instanceof ServiceUnavailableException && error.getStatus() === 503,
      );
    },
  );
});

test('login and public equipment routes have their respective Redis guards attached', () => {
  const loginGuards = Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype.login) as unknown[];
  const publicLookupGuards = Reflect.getMetadata(
    GUARDS_METADATA,
    PublicEquipmentController.prototype.findOne,
  ) as unknown[];

  assert.ok(loginGuards.includes(RedisRateLimitGuard));
  assert.ok(publicLookupGuards.includes(PublicEquipmentRateLimitGuard));
});

test('login and public lookup limits use separate buckets and default windows', async () => {
  await withRateLimitEnvironment({}, async () => {
    const calls: Array<{ key: string; windowSeconds: number }> = [];
    const redis = {
      incrementRateLimitCounter: async (key: string, windowSeconds: number) => {
        calls.push({ key, windowSeconds });
        return 1;
      },
    } as unknown as RedisService;

    await new RedisRateLimitGuard(redis).canActivate(makeContext('203.0.113.13'));
    await new PublicEquipmentRateLimitGuard(redis).canActivate(makeContext('203.0.113.13'));

    assert.deepEqual(calls, [
      { key: 'ratelimit:login:203.0.113.13', windowSeconds: 60 },
      { key: 'ratelimit:public-equipment:203.0.113.13', windowSeconds: 60 },
    ]);
  });
});
