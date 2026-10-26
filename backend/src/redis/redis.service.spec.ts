import assert from 'node:assert/strict';
import test from 'node:test';
import type Redis from 'ioredis';
import { RedisService } from './redis.service';

test('incrementRateLimitCounter atomically increments and repairs a missing TTL', async () => {
  const calls: unknown[][] = [];
  const service = new RedisService({
    eval: async (...args: unknown[]) => {
      calls.push(args);
      return 4;
    },
  } as unknown as Redis);

  assert.equal(await service.incrementRateLimitCounter('ratelimit:login:203.0.113.1', 60), 4);
  assert.equal(calls.length, 1, 'counter and expiry must use a single Redis command');
  assert.equal(calls[0]?.[1], 1);
  assert.equal(calls[0]?.[2], 'ratelimit:login:203.0.113.1');
  assert.equal(calls[0]?.[3], 60);
  assert.match(String(calls[0]?.[0]), /INCR/u);
  assert.match(String(calls[0]?.[0]), /TTL/u);
  assert.match(String(calls[0]?.[0]), /EXPIRE/u);
});

test('incrementRateLimitCounter validates window and Redis response', async () => {
  let calls = 0;
  const service = new RedisService({
    eval: async () => {
      calls += 1;
      return 'not-a-count';
    },
  } as unknown as Redis);

  await assert.rejects(service.incrementRateLimitCounter('rate', 0), RangeError);
  await assert.rejects(service.incrementRateLimitCounter('rate', 10), /invalid rate-limit counter/u);
  assert.equal(calls, 1, 'invalid windows must be rejected before calling Redis');
});

test('cache/lock warnings are structured JSON without Redis key names or secrets', async () => {
  const failure = new Error('password=ci-secret connection refused');
  const service = new RedisService({
    get: async () => {
      throw failure;
    },
    set: async () => {
      throw failure;
    },
    del: async () => {
      throw failure;
    },
  } as unknown as Redis);
  const warnings: string[] = [];
  (service as unknown as { logger: { warn: (line: string) => void } }).logger = {
    warn: (line: string) => warnings.push(line),
  };

  assert.equal(await service.getJson('settings:user:john@example.com'), undefined);
  await service.setJson('settings:user:john@example.com', { role: 'admin' }, 60);
  await service.del('settings:user:john@example.com', 'settings:row:app.name');

  assert.equal(warnings.length, 3);
  const events = warnings.map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.deepEqual(
    events.map(({ operation }) => operation),
    ['getJson', 'setJson', 'del'],
  );
  assert.ok(events.every(({ event }) => event === 'redis_operation_failed'));
  assert.equal(events[2]?.keyCount, 2);
  assert.ok(warnings.every((line) => !line.includes('ci-secret')));
  assert.ok(warnings.every((line) => !line.includes('john@example.com')));
  assert.ok(warnings.every((line) => !line.includes('settings:user')));
});

test('renewLock atomically extends a lease only for the current owner token', async () => {
  const calls: unknown[][] = [];
  let scriptResult: unknown = 1;
  const service = new RedisService({
    eval: async (...args: unknown[]) => {
      calls.push(args);
      return scriptResult;
    },
  } as unknown as Redis);

  assert.equal(await service.renewLock('scheduler-lock', 'owner-token', 20_000), true);
  assert.equal(calls[0]?.[1], 1);
  assert.equal(calls[0]?.[2], 'scheduler-lock');
  assert.equal(calls[0]?.[3], 'owner-token');
  assert.equal(calls[0]?.[4], 20_000);
  assert.match(String(calls[0]?.[0]), /PEXPIRE/u);
  assert.match(String(calls[0]?.[0]), /GET/u);

  scriptResult = 0;
  assert.equal(await service.renewLock('scheduler-lock', 'stale-token', 20_000), false);
  await assert.rejects(service.renewLock('scheduler-lock', 'owner-token', 0), RangeError);
  assert.equal(calls.length, 2, 'invalid lease durations must not call Redis');
});
