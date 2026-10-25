import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { startHealthServer, type HealthState } from './health-server';

const withHealthServer = async (
  state: HealthState,
  checkRedis: () => Promise<void>,
  run: (baseUrl: string) => Promise<void>,
  sofficeBinary = process.execPath,
): Promise<void> => {
  const server = startHealthServer(0, sofficeBinary, state, checkRedis);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
};

test('health endpoint remains unready until BullMQ reports Redis ready', async () => {
  let redisChecks = 0;
  await withHealthServer(
    { redisReady: false, shuttingDown: false },
    async () => {
      redisChecks += 1;
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { status: 'redis_not_ready' });
      assert.equal(redisChecks, 0);
    },
  );
});

test('health endpoint checks current Redis connectivity and hides probe errors', async () => {
  await withHealthServer(
    { redisReady: true, shuttingDown: false },
    async () => {
      throw new Error('internal redis endpoint and credentials must not be returned');
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { status: 'redis_not_ready' });
    },
  );
});

test('health endpoint follows Redis outages after its initial ready event', async () => {
  let redisChecks = 0;
  let redisAvailable = true;
  await withHealthServer(
    { redisReady: true, shuttingDown: false },
    async () => {
      redisChecks += 1;
      if (!redisAvailable) throw new Error('Redis is disconnected');
    },
    async (baseUrl) => {
      const healthy = await fetch(`${baseUrl}/health`);
      assert.equal(healthy.status, 200);
      assert.deepEqual(await healthy.json(), { status: 'ok' });

      redisAvailable = false;
      const unavailable = await fetch(`${baseUrl}/health`);
      assert.equal(unavailable.status, 503);
      assert.deepEqual(await unavailable.json(), { status: 'redis_not_ready' });

      redisAvailable = true;
      const recovered = await fetch(`${baseUrl}/health`);
      assert.equal(recovered.status, 200);
      assert.deepEqual(await recovered.json(), { status: 'ok' });
      assert.equal(redisChecks, 3, 'Redis should be checked on every health request');
    },
  );
});

test('health endpoint hides soffice execution details', async () => {
  await withHealthServer(
    { redisReady: true, shuttingDown: false },
    async () => {},
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { status: 'soffice_unavailable' });
    },
    '/sensitive/internal/path/missing-soffice',
  );
});

test('health endpoint reports shutdown and rejects unknown paths', async () => {
  let redisChecks = 0;
  await withHealthServer(
    { redisReady: false, shuttingDown: true },
    async () => {
      redisChecks += 1;
    },
    async (baseUrl) => {
      const shuttingDown = await fetch(`${baseUrl}/health`);
      assert.equal(shuttingDown.status, 503);
      assert.deepEqual(await shuttingDown.json(), { status: 'shutting_down' });

      const unknownPath = await fetch(`${baseUrl}/ready`);
      assert.equal(unknownPath.status, 404);
      assert.equal(redisChecks, 0);
    },
  );
});
