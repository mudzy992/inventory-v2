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
