import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpException } from '@nestjs/common';
import { HealthController } from './health.controller';

const createController = (redisPing: () => Promise<string> = async () => 'PONG') =>
  new HealthController(
    { $queryRaw: async () => [{ '?column?': 1 }] } as never,
    { getClient: () => ({ ping: redisPing }) } as never,
  );

test('keeps legacy health as a database-only probe', async () => {
  const controller = createController(() => Promise.reject(new Error('Redis down')));
  const result = await controller.getHealth();
  assert.equal(result.status, 'ok');
  assert.equal(result.database, 'connected');
});

test('readiness reports database and Redis availability', async () => {
  const result = await createController().getReadiness();
  assert.equal(result.status, 'ok');
  assert.equal(result.database, 'connected');
  assert.equal(result.redis, 'connected');
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
