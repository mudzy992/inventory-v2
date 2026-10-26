import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RedisConnectionStats } from '../../../redis/redis-connection.registry';
import {
  buildRedisMetricsSnapshot,
  evaluateRedisMetrics,
  REDIS_PING_TIMEOUT_MS,
  REDIS_WARN_DISCONNECT_SECONDS,
  REDIS_WARN_PING_MS,
  REDIS_WARN_RECONNECT_COUNT,
  withTimeout,
  type RedisMetricsThresholds,
} from './redis-metrics.util';

const thresholds: RedisMetricsThresholds = {
  warnPingMs: REDIS_WARN_PING_MS,
  warnDisconnectSeconds: REDIS_WARN_DISCONNECT_SECONDS,
  warnReconnectCount: REDIS_WARN_RECONNECT_COUNT,
};

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

describe('withTimeout', () => {
  it('resolves before the deadline and clears the timer', async () => {
    assert.equal(await withTimeout(Promise.resolve('PONG'), 50, 'Redis PING'), 'PONG');
  });

  it('rejects after the deadline instead of hanging the metrics interval', async () => {
    await assert.rejects(
      withTimeout(new Promise<string>(() => undefined), 5, 'Redis PING'),
      /Redis PING timed out after 5ms/u,
    );
  });
});

describe('buildRedisMetricsSnapshot', () => {
  it('copies live connection stats, ping result and thresholds', () => {
    const snapshot = buildRedisMetricsSnapshot(
      healthyStats(),
      12,
      true,
      thresholds,
      new Date('2026-10-26T22:00:10.000Z'),
    );
    assert.deepEqual(snapshot, {
      observedAt: '2026-10-26T22:00:10.000Z',
      state: 'ready',
      clientStatus: 'ready',
      ready: true,
      pingOk: true,
      pingMs: 12,
      pingTimeoutMs: REDIS_PING_TIMEOUT_MS,
      reconnectCount: 0,
      errorCount: 0,
      lastReadyAt: '2026-10-26T22:00:00.000Z',
      lastDisconnectAt: null,
      lastErrorAt: null,
      secondsSinceLastReady: 10,
      registryUnavailable: false,
      ...thresholds,
    });
  });

  it('uses the last disconnect timestamp when the client was never ready', () => {
    const snapshot = buildRedisMetricsSnapshot(
      healthyStats({
        state: 'reconnecting',
        clientStatus: 'reconnecting',
        ready: false,
        lastReadyAt: null,
        lastDisconnectAt: '2026-10-26T21:59:00.000Z',
      }),
      null,
      false,
      thresholds,
      new Date('2026-10-26T22:00:10.000Z'),
    );
    assert.equal(snapshot.secondsSinceLastReady, 70);
    assert.equal(snapshot.registryUnavailable, false);
  });

  it('marks a missing registry without inventing connection counters', () => {
    const snapshot = buildRedisMetricsSnapshot(null, null, false, thresholds);
    assert.equal(snapshot.registryUnavailable, true);
    assert.equal(snapshot.state, 'unknown');
    assert.equal(snapshot.ready, false);
    assert.equal(snapshot.reconnectCount, 0);
    assert.equal(snapshot.secondsSinceLastReady, null);
  });
});

describe('evaluateRedisMetrics', () => {
  it('keeps a healthy ready client at log level', () => {
    const snapshot = buildRedisMetricsSnapshot(healthyStats(), 12, true, thresholds);
    assert.deepEqual(evaluateRedisMetrics(snapshot), { level: 'log', reasons: [] });
  });

  it('reports an unavailable registry separately from Redis failures', () => {
    const snapshot = buildRedisMetricsSnapshot(null, null, false, thresholds);
    assert.deepEqual(evaluateRedisMetrics(snapshot), {
      level: 'warn',
      reasons: ['registry_unavailable', 'not_ready', 'ping_error'],
    });
  });

  it('reports slow ping, long disconnect and repeated reconnects', () => {
    const snapshot = buildRedisMetricsSnapshot(
      healthyStats({
        state: 'reconnecting',
        clientStatus: 'reconnecting',
        ready: false,
        lastReadyAt: '2026-10-26T21:58:00.000Z',
        lastDisconnectAt: '2026-10-26T21:59:00.000Z',
        reconnectCount: 4,
        errorCount: 2,
      }),
      300,
      true,
      thresholds,
      new Date('2026-10-26T22:00:10.000Z'),
    );
    assert.deepEqual(evaluateRedisMetrics(snapshot), {
      level: 'warn',
      reasons: ['not_ready', 'slow_ping', 'disconnected_too_long', 'reconnects'],
    });
  });
});
