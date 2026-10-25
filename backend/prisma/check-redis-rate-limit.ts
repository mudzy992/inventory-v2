import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { RedisService } from '../src/redis/redis.service';

const main = async (): Promise<void> => {
  const host = process.env.REDIS_HOST;
  const port = Number(process.env.REDIS_PORT);
  if (!host || !Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('REDIS_HOST and a valid REDIS_PORT are required for the Redis integration check');
  }

  const keyPrefix = `ci:rate-limit:${randomUUID()}:`;
  const client = new Redis({
    host,
    port,
    keyPrefix,
    maxRetriesPerRequest: 3,
    retryStrategy: (attempts) => Math.min(attempts * 100, 1000),
  });
  const redisService = new RedisService(client);
  const concurrency = 32;

  try {
    assert.equal(await client.ping(), 'PONG');
    const counts = await Promise.all(
      Array.from({ length: concurrency }, () =>
        redisService.incrementRateLimitCounter('concurrent', 60),
      ),
    );
    assert.deepEqual(
      [...counts].sort((left, right) => left - right),
      Array.from({ length: concurrency }, (_, index) => index + 1),
      'concurrent increments must return every counter value exactly once',
    );

    const counterTtl = await client.ttl('concurrent');
    assert.ok(counterTtl > 0 && counterTtl <= 60, 'new counters must have an expiry');

    await client.set('legacy-without-ttl', '4');
    assert.equal(
      await redisService.incrementRateLimitCounter('legacy-without-ttl', 60),
      5,
      'existing counters without an expiry must remain incrementable',
    );
    const legacyTtl = await client.ttl('legacy-without-ttl');
    assert.ok(legacyTtl > 0 && legacyTtl <= 60, 'a legacy counter without TTL must be repaired');

    console.log('Verified atomic Redis rate-limit increments, expiry, and legacy TTL repair.');
  } finally {
    try {
      await client.del('concurrent', 'legacy-without-ttl');
    } finally {
      client.disconnect();
    }
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
