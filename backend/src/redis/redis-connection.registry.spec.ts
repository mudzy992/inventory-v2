import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import type Redis from 'ioredis';
import {
  attachRedisConnectionObservers,
  clearActiveRedisClient,
  readActiveRedisConnectionStats,
  redisConnectionRegistry,
  setActiveRedisClient,
} from './redis-connection.registry';

class FakeRedis extends EventEmitter {
  status = 'wait';
}

const fakeClient = (status = 'wait'): Redis => {
  const client = new FakeRedis();
  client.status = status;
  return client as unknown as Redis;
};

describe('redisConnectionRegistry', () => {
  it('returns null before a shared Redis client is registered', () => {
    clearActiveRedisClient();
    assert.equal(readActiveRedisConnectionStats(), null);
    assert.equal(redisConnectionRegistry.getStats(), null);
  });

  it('derives readiness and state from the live ioredis status', () => {
    try {
      const client = fakeClient('ready');
      setActiveRedisClient(client);
      const stats = readActiveRedisConnectionStats();
      assert.ok(stats);
      assert.equal(stats.state, 'ready');
      assert.equal(stats.clientStatus, 'ready');
      assert.equal(stats.ready, true);
      assert.equal(stats.reconnectCount, 0);
    } finally {
      clearActiveRedisClient();
    }
  });

  it('records lifecycle counters, timestamps and redacted errors', () => {
    try {
      setActiveRedisClient(fakeClient('ready'));
      const at = new Date('2026-10-26T22:00:00.000Z');
      redisConnectionRegistry.recordEvent('connect', {}, at);
      redisConnectionRegistry.recordEvent('ready', {}, at);
      redisConnectionRegistry.recordEvent(
        'reconnecting',
        { retryDelayMs: 400 },
        new Date('2026-10-26T22:01:00.000Z'),
      );
      redisConnectionRegistry.recordEvent(
        'error',
        { message: 'password=ci-secret is invalid' },
        new Date('2026-10-26T22:02:00.000Z'),
      );
      const stats = readActiveRedisConnectionStats();
      assert.ok(stats);
      assert.equal(stats.connectCount, 1);
      assert.equal(stats.readyCount, 1);
      assert.equal(stats.reconnectCount, 1);
      assert.equal(stats.errorCount, 1);
      assert.equal(stats.lastReadyAt, '2026-10-26T22:00:00.000Z');
      assert.equal(stats.lastDisconnectAt, '2026-10-26T22:01:00.000Z');
      assert.equal(stats.lastErrorAt, '2026-10-26T22:02:00.000Z');
      assert.equal(stats.lastErrorMessage, 'password=[redacted] is invalid');
    } finally {
      clearActiveRedisClient();
    }
  });

  it('attaches event observers and detaches them on cleanup', () => {
    const client = fakeClient('ready');
    const detach = attachRedisConnectionObservers(client, { emitLogs: false });
    try {
      client.emit('connect');
      client.emit('ready');
      client.emit('reconnecting', 200);
      client.emit('error', new Error('connection reset'));
      const stats = redisConnectionRegistry.getStats();
      assert.ok(stats);
      assert.equal(stats.connectCount, 1);
      assert.equal(stats.readyCount, 1);
      assert.equal(stats.reconnectCount, 1);
      assert.equal(stats.errorCount, 1);
      assert.equal(stats.lastErrorMessage, 'connection reset');
    } finally {
      detach();
    }
    assert.equal(redisConnectionRegistry.getStats(), null);
    client.emit('ready');
    assert.equal(redisConnectionRegistry.getStats(), null);
  });

  it('falls back to unknown state when a disposed client status getter throws', () => {
    try {
      setActiveRedisClient({
        get status() {
          throw new Error('client closed');
        },
        on: () => undefined,
        off: () => undefined,
      } as unknown as Redis);
      const stats = readActiveRedisConnectionStats();
      assert.ok(stats);
      assert.equal(stats.state, 'unknown');
      assert.equal(stats.clientStatus, 'unknown');
      assert.equal(stats.ready, false);
    } finally {
      clearActiveRedisClient();
    }
  });
});
