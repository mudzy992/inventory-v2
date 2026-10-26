import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RedisConnectionStats } from '../../redis/redis-connection.registry';
import { redisConnectionRegistry } from '../../redis/redis-connection.registry';
import { RedisService } from '../../redis/redis.service';
import { SettingsService } from '../settings/settings.service';
import { RedisMetricsService } from './redis-metrics.service';
import {
  REDIS_WARN_DISCONNECT_SECONDS,
  REDIS_WARN_PING_MS,
  REDIS_WARN_RECONNECT_COUNT,
} from './utils/redis-metrics.util';

interface CapturedLog {
  level: 'log' | 'warn' | 'error';
  line: string;
}

const healthyStats = (overrides: Partial<RedisConnectionStats> = {}): RedisConnectionStats => ({
  state: 'ready',
  clientStatus: 'ready',
  ready: true,
  lastEvent: 'ready',
  lastEventAt: '2026-10-26T22:00:00.000Z',
  lastReadyAt: '2026-10-26T22:00:00.000Z',
  lastDisconnectAt: null,
  lastErrorAt: null,
  lastErrorMessage: null,
  connectCount: 1,
  readyCount: 1,
  reconnectCount: 0,
  errorCount: 0,
  closeCount: 0,
  endCount: 0,
  ...overrides,
});

const createHarness = (
  options: {
    stats?: RedisConnectionStats | null;
    ping?: () => Promise<string>;
    thresholds?: Record<string, number>;
    settingsError?: Error;
  } = {},
): {
  service: RedisMetricsService;
  logs: CapturedLog[];
  restore: () => void;
} => {
  const originalGetStats = redisConnectionRegistry.getStats;
  redisConnectionRegistry.getStats = () =>
    options.stats === undefined ? healthyStats() : options.stats;
  const redis = {
    getClient: () => ({ ping: options.ping ?? (async () => 'PONG') }),
  } as unknown as RedisService;
  const settings = {
    getNumberValue: async (key: string, fallback: number): Promise<number> => {
      if (options.settingsError) throw options.settingsError;
      return options.thresholds?.[key] ?? fallback;
    },
  } as unknown as SettingsService;
  const service = new RedisMetricsService(redis, settings);
  const logs: CapturedLog[] = [];
  (service as unknown as { logger: Record<string, (line: string) => void> }).logger = {
    log: (line: string) => logs.push({ level: 'log', line }),
    warn: (line: string) => logs.push({ level: 'warn', line }),
    error: (line: string) => logs.push({ level: 'error', line }),
  };
  return {
    service,
    logs,
    restore: () => {
      redisConnectionRegistry.getStats = originalGetStats;
    },
  };
};

describe('RedisMetricsService', () => {
  it('emits a structured healthy snapshot for a ready client', async (t) => {
    const { service, logs, restore } = createHarness({
      thresholds: {
        'redis.metrics.warn_ping_ms': 500,
        'redis.metrics.warn_disconnect_seconds': 120,
        'redis.metrics.warn_reconnect_count': 5,
      },
    });
    t.after(restore);
    const snapshot = await service.reportMetrics();
    assert.ok(snapshot);
    assert.equal(snapshot.ready, true);
    assert.equal(snapshot.pingOk, true);
    assert.equal(snapshot.state, 'ready');
    assert.equal(snapshot.warnPingMs, 500);
    assert.equal(snapshot.warnDisconnectSeconds, 120);
    assert.equal(snapshot.warnReconnectCount, 5);
    assert.ok(typeof snapshot.pingMs === 'number' && snapshot.pingMs >= 0);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'log');
    const line = JSON.parse(logs[0].line) as Record<string, unknown>;
    assert.equal(line.event, 'redis_connection_health');
    assert.equal(line.level, 'log');
    assert.deepEqual(line.reasons, []);
  });

  it('warns when the bounded PING probe fails', async (t) => {
    const { service, logs, restore } = createHarness({
      ping: async () => {
        throw new Error('password=ci-secret connection refused');
      },
    });
    t.after(restore);
    const snapshot = await service.reportMetrics();
    assert.ok(snapshot);
    assert.equal(snapshot.pingOk, false);
    assert.equal(snapshot.pingMs, null);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'warn');
    const line = JSON.parse(logs[0].line) as { reasons: string[] };
    assert.deepEqual(line.reasons, ['ping_error']);
    assert.equal(logs[0].line.includes('ci-secret'), false);
  });

  it('warns on a long disconnect and repeated reconnects', async (t) => {
    const { service, logs, restore } = createHarness({
      stats: healthyStats({
        state: 'reconnecting',
        clientStatus: 'reconnecting',
        ready: false,
        lastReadyAt: '2026-10-25T21:58:00.000Z',
        lastDisconnectAt: '2026-10-25T21:59:00.000Z',
        reconnectCount: 3,
        errorCount: 2,
      }),
    });
    t.after(restore);
    const snapshot = await service.reportMetrics();
    assert.ok(snapshot);
    assert.equal(snapshot.ready, false);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'warn');
    const line = JSON.parse(logs[0].line) as { reasons: string[] };
    assert.deepEqual(line.reasons, [
      'not_ready',
      'disconnected_too_long',
      'reconnects',
    ]);
  });

  it('warns separately when the connection registry is unavailable', async (t) => {
    const { service, logs, restore } = createHarness({ stats: null });
    t.after(restore);
    const snapshot = await service.reportMetrics();
    assert.ok(snapshot);
    assert.equal(snapshot.registryUnavailable, true);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'warn');
    const line = JSON.parse(logs[0].line) as { reasons: string[] };
    assert.deepEqual(line.reasons, ['registry_unavailable', 'not_ready']);
  });

  it('falls back to safe thresholds when settings fail, without leaking the error', async (t) => {
    const { service, logs, restore } = createHarness({
      settingsError: new Error('password=ci-secret settings unavailable'),
    });
    t.after(restore);
    const snapshot = await service.collectMetrics();
    assert.equal(snapshot.warnPingMs, REDIS_WARN_PING_MS);
    assert.equal(snapshot.warnDisconnectSeconds, REDIS_WARN_DISCONNECT_SECONDS);
    assert.equal(snapshot.warnReconnectCount, REDIS_WARN_RECONNECT_COUNT);
    assert.equal(logs.length, 3);
    assert.ok(logs.every((entry) => entry.level === 'warn'));
    assert.ok(
      logs.every((entry) => {
        const line = JSON.parse(entry.line) as { event: string };
        return line.event === 'redis_metrics_setting_fallback';
      }),
    );
    assert.ok(logs.every((entry) => !entry.line.includes('ci-secret')));
  });
});
