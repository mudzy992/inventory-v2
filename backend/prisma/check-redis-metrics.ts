import assert from 'node:assert/strict';
import Redis from 'ioredis';
import { RedisMetricsService } from '../src/modules/health/redis-metrics.service';
import { withTimeout } from '../src/modules/health/utils/redis-metrics.util';
import { SettingsService } from '../src/modules/settings/settings.service';
import {
  attachRedisConnectionObservers,
  clearActiveRedisClient,
  redisConnectionRegistry,
} from '../src/redis/redis-connection.registry';
import { RedisService } from '../src/redis/redis.service';

interface CapturedLog {
  level: 'log' | 'warn' | 'error';
  line: string;
}

const main = async (): Promise<void> => {
  const host = process.env.REDIS_HOST ?? '127.0.0.1';
  const port = Number(process.env.REDIS_PORT ?? 6379);
  if (
    process.env.NODE_ENV !== 'test' ||
    !['localhost', '127.0.0.1'].includes(host) ||
    !Number.isInteger(port)
  ) {
    throw new Error('Redis metrics integration check is restricted to the local CI Redis service');
  }

  const client = new Redis({
    host,
    port,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  const detach = attachRedisConnectionObservers(client, { emitLogs: false });
  const redis = { getClient: () => client } as unknown as RedisService;
  const settings = {
    getNumberValue: async (_key: string, fallback: number): Promise<number> => fallback,
  } as unknown as SettingsService;
  const service = new RedisMetricsService(redis, settings);
  const logs: CapturedLog[] = [];
  (service as unknown as { logger: Record<string, (line: string) => void> }).logger = {
    log: (line: string) => logs.push({ level: 'log', line }),
    warn: (line: string) => logs.push({ level: 'warn', line }),
    error: (line: string) => logs.push({ level: 'error', line }),
  };

  try {
    await client.connect();
    if (client.status !== 'ready') {
      await withTimeout(
        new Promise<void>((resolve) => client.once('ready', () => resolve())),
        5_000,
        'Redis ready event',
      );
    }
    await client.ping();

    const snapshot = await service.collectMetrics();
    assert.equal(snapshot.registryUnavailable, false);
    assert.equal(snapshot.ready, true);
    assert.equal(snapshot.state, 'ready');
    assert.equal(snapshot.pingOk, true);
    assert.ok(typeof snapshot.pingMs === 'number' && snapshot.pingMs >= 0);
    assert.equal(snapshot.warnPingMs, 250);
    assert.equal(snapshot.warnDisconnectSeconds, 60);
    assert.equal(snapshot.warnReconnectCount, 3);

    const reported = await service.reportMetrics();
    assert.ok(reported);
    assert.equal(logs.length, 1);
    assert.ok(['log', 'warn'].includes(logs[0].level));
    const line = JSON.parse(logs[0].line) as Record<string, unknown>;
    assert.equal(line.event, 'redis_connection_health');
    assert.equal(line.ready, true);
    assert.equal(line.pingOk, true);
    assert.equal(line.registryUnavailable, false);
    assert.ok(Array.isArray(line.reasons));
    assert.equal(line.level, logs[0].level);

    redisConnectionRegistry.recordEvent('reconnecting', { retryDelayMs: 200 });
    const afterReconnect = await service.collectMetrics();
    assert.equal(afterReconnect.reconnectCount, 1);

    console.log(
      `Verified Redis connection health metrics: state=${reported.state}, ` +
        `pingMs=${reported.pingMs}, reconnectCount=${afterReconnect.reconnectCount}.`,
    );
  } finally {
    detach();
    client.disconnect();
    clearActiveRedisClient();
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
