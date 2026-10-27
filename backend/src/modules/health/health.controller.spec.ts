import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpException } from '@nestjs/common';
import {
  resetActiveSocketIoAdapterMode,
  setActiveSocketIoAdapterMode,
} from '../../redis/socketio-adapter.registry';
import { HealthController } from './health.controller';

const createController = (
  redisPing: () => Promise<string> = async () => 'PONG',
  inventoryQueueProbe: () => Promise<Record<string, number>> = async () => ({ waiting: 0, active: 0 }),
  documentQueueProbe: () => Promise<Record<string, number>> = async () => ({ waiting: 0, active: 0 }),
  databaseProbe: () => Promise<unknown> = async () => [{ '?column?': 1 }],
) =>
  new HealthController(
    { $queryRaw: databaseProbe } as never,
    { getClient: () => ({ ping: redisPing }) } as never,
    { getJobCounts: inventoryQueueProbe } as never,
    { getJobCounts: documentQueueProbe } as never,
  );

test('liveness is process-only and does not probe dependencies', () => {
  const controller = createController(
    () => Promise.reject(new Error('Redis down')),
    () => Promise.reject(new Error('queue down')),
    () => Promise.reject(new Error('queue down')),
    () => Promise.reject(new Error('database down')),
  );
  const result = controller.getLiveness();
  assert.equal(result.status, 'ok');
  assert.equal(new Date(result.timestamp).toISOString(), result.timestamp);
});

test('keeps legacy health as a database-only probe', async () => {
  const controller = createController(() => Promise.reject(new Error('Redis down')));
  const result = await controller.getHealth();
  assert.equal(result.status, 'ok');
  assert.equal(result.database, 'connected');
});

test('readiness probes database, shared Redis, and both BullMQ queues', async () => {
  try {
    setActiveSocketIoAdapterMode('shared_redis');
    const result = await createController().getReadiness();
    assert.equal(result.status, 'ok');
    assert.equal(result.database, 'connected');
    assert.equal(result.redis, 'connected');
    assert.deepEqual(result.queues, {
      inventoryClose: 'connected',
      documentGeneration: 'connected',
    });
    assert.deepEqual(result.socketio, {
      mode: 'shared_redis',
      sharedAdapterRequired: false,
    });
  } finally {
    resetActiveSocketIoAdapterMode();
  }
});

test('readiness degrades when a required shared Socket.IO adapter fell back', async () => {
  const previous = process.env.SOCKETIO_REQUIRE_SHARED_ADAPTER;
  try {
    process.env.SOCKETIO_REQUIRE_SHARED_ADAPTER = 'true';
    setActiveSocketIoAdapterMode('in_memory');
    await assert.rejects(
      () => createController().getReadiness(),
      (error: unknown) => {
        assert.ok(error instanceof HttpException);
        assert.equal(error.getStatus(), 503);
        const response = error.getResponse() as {
          status: string;
          socketio: { mode: string; sharedAdapterRequired: boolean };
        };
        assert.equal(response.status, 'degraded');
        assert.deepEqual(response.socketio, {
          mode: 'in_memory',
          sharedAdapterRequired: true,
        });
        return true;
      },
    );
  } finally {
    if (previous === undefined) delete process.env.SOCKETIO_REQUIRE_SHARED_ADAPTER;
    else process.env.SOCKETIO_REQUIRE_SHARED_ADAPTER = previous;
    resetActiveSocketIoAdapterMode();
  }
});

test('readiness returns 503 when Redis is unavailable', async () => {
  const controller = createController(() => Promise.reject(new Error('Redis down')));
  await assert.rejects(
    () => controller.getReadiness(),
    (error: unknown) => {
      assert.ok(error instanceof HttpException);
      assert.equal(error.getStatus(), 503);
      assert.equal((error.getResponse() as { redis: string }).redis, 'disconnected');
      return true;
    },
  );
});

test('readiness reports a failing BullMQ queue independently', async () => {
  const controller = createController(
    async () => 'PONG',
    () => Promise.reject(new Error('queue down')),
  );
  await assert.rejects(
    () => controller.getReadiness(),
    (error: unknown) => {
      assert.ok(error instanceof HttpException);
      const response = error.getResponse() as {
        queues: { inventoryClose: string; documentGeneration: string };
      };
      assert.equal(response.queues.inventoryClose, 'disconnected');
      assert.equal(response.queues.documentGeneration, 'connected');
      return true;
    },
  );
});
