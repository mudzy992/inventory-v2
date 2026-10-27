import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server as HttpServer } from 'node:http';
import { createServer, type AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import type { INestApplicationContext } from '@nestjs/common';
import type { Server as SocketIoServer } from 'socket.io';
import { io as createClient, type Socket } from 'socket.io-client';
import { HealthController } from '../src/modules/health/health.controller';
import { RedisIoAdapter } from '../src/redis/redis-io.adapter';
import { resetActiveSocketIoAdapterMode } from '../src/redis/socketio-adapter.registry';
import { startRespPubSubServer, type RespPubSubServer } from './utils/resp-pubsub-test-server.util';

/**
 * Proves that two independent Socket.IO servers (i.e. two backend replicas)
 * really share rooms through Redis, that their channels stay inside the
 * configured `<prefix>:*` pub/sub namespace, and that a different prefix
 * cannot cross-talk. Also proves the fail-closed startup policy and that
 * readiness reports the effective adapter mode.
 *
 * Runs against an in-process RESP Pub/Sub stub — no Redis binary is required.
 */

const ROOM = 'audit-shared-room';
const PREFIX_A = 'inventory-v2:';
const PREFIX_B = 'other-deployment:';

const ENV_NAMES = [
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_USERNAME',
  'REDIS_PASSWORD',
  'REDIS_DB',
  'REDIS_KEY_PREFIX',
  'REDIS_TLS',
  'REDIS_CA_CERT_PATH',
  'SOCKETIO_REQUIRE_SHARED_ADAPTER',
] as const;

const delay = (ms: number): Promise<void> =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

/** Reserve — then immediately release — an ephemeral port that nothing serves. */
const findDeadPort = async (): Promise<number> => {
  const probe = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    probe.once('error', rejectListen);
    probe.listen(0, '127.0.0.1', () => {
      probe.off('error', rejectListen);
      resolveListen();
    });
  });
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolveClose) => probe.close(() => resolveClose()));
  return port;
};

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
      timer.unref();
    }),
  ]);

const setRedisEnvironment = (port: number, prefix: string): void => {
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = String(port);
  process.env.REDIS_USERNAME = '';
  process.env.REDIS_PASSWORD = '';
  process.env.REDIS_DB = '0';
  process.env.REDIS_KEY_PREFIX = prefix;
  process.env.REDIS_TLS = 'false';
  delete process.env.REDIS_CA_CERT_PATH;
};

interface Instance {
  adapter: RedisIoAdapter;
  server: SocketIoServer;
  client: Socket;
}

const connectClient = async (client: Socket): Promise<void> => {
  await withTimeout(
    new Promise<void>((resolveConnect, rejectConnect) => {
      client.once('connect', () => resolveConnect());
      client.once('connect_error', (error: Error) => rejectConnect(error));
    }),
    5000,
    'Socket.IO client connect',
  );
};

const createInstance = async (room: string): Promise<Instance> => {
  const adapter = new RedisIoAdapter(undefined as unknown as INestApplicationContext);
  await adapter.connectToRedis();
  assert.equal(adapter.getMode(), 'shared_redis', 'adapter must be in shared Redis mode');

  const server = adapter.createIOServer(0, {});
  server.on('connection', (socket) => {
    socket.on('audit:join', (roomName: string, ack?: (response: unknown) => void) => {
      // Depending on the installed adapter, join() returns void or a Promise.
      void Promise.resolve(socket.join(roomName)).then(() => ack?.({ joined: true }));
    });
  });

  const httpServer = (server as unknown as { httpServer: HttpServer }).httpServer;
  if (!httpServer.listening) await once(httpServer, 'listening');
  const address = httpServer.address() as AddressInfo;

  const client = createClient(`http://127.0.0.1:${address.port}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  await connectClient(client);
  const acknowledgement = await withTimeout(
    client.emitWithAck('audit:join', room),
    5000,
    'Socket.IO room join',
  );
  assert.deepEqual(acknowledgement, { joined: true });
  return { adapter, server, client };
};

const closeInstance = async (instance: Instance): Promise<void> => {
  instance.client.disconnect();
  await new Promise<void>((resolveClose) => instance.server.close(() => resolveClose()));
  await instance.adapter.close();
};

const waitForEvent = (client: Socket, event: string, timeoutMs: number): Promise<unknown> =>
  withTimeout(
    new Promise((resolveEvent) => client.once(event, (payload: unknown) => resolveEvent(payload))),
    timeoutMs,
    `${event} delivery`,
  );

const track = (client: Socket, event: string): unknown[] => {
  const seen: unknown[] = [];
  client.on(event, (payload: unknown) => seen.push(payload));
  return seen;
};

const main = async (): Promise<void> => {
  const root = resolve('.');
  const previous = new Map(ENV_NAMES.map((name) => [name, process.env[name]]));
  const instances: Instance[] = [];
  let redis: RespPubSubServer | undefined;

  try {
    delete process.env.SOCKETIO_REQUIRE_SHARED_ADAPTER;
    redis = await startRespPubSubServer();

    setRedisEnvironment(redis.port, PREFIX_A);
    const instanceA = await createInstance(ROOM);
    instances.push(instanceA);
    const instanceB = await createInstance(ROOM);
    instances.push(instanceB);

    // 1. A real cross-instance broadcast: emit from replica B, receive on a
    //    WebSocket connected to replica A.
    const inbound = waitForEvent(instanceA.client, 'audit:pulse', 3000);
    instanceB.server.to(ROOM).emit('audit:pulse', { from: 'B' });
    assert.deepEqual(await inbound, { from: 'B' });

    // 2. Readiness must now be able to prove the shared adapter is installed.
    const controller = new HealthController(
      { $queryRaw: async () => [{ '?column?': 1 }] } as never,
      { getClient: () => ({ ping: async () => 'PONG' }) } as never,
      { getJobCounts: async () => ({ waiting: 0, active: 0 }) } as never,
      { getJobCounts: async () => ({ waiting: 0, active: 0 }) } as never,
    );
    const readiness = await controller.getReadiness();
    assert.equal(readiness.status, 'ok');
    assert.deepEqual(readiness.socketio, {
      mode: 'shared_redis',
      sharedAdapterRequired: false,
    });

    // 3. A second deployment namespace must not cross-talk on the same Redis.
    setRedisEnvironment(redis.port, PREFIX_B);
    const instanceC = await createInstance(ROOM);
    instances.push(instanceC);

    const foreignOnA = track(instanceA.client, 'audit:foreign');
    const foreignOnB = track(instanceB.client, 'audit:foreign');
    const foreignOnC = track(instanceC.client, 'audit:foreign');
    instanceC.server.to(ROOM).emit('audit:foreign', { from: 'C' });
    await delay(600);
    assert.equal(foreignOnA.length, 0, 'prefix B must not reach prefix A clients');
    assert.equal(foreignOnB.length, 0, 'prefix B must not reach prefix A clients');
    assert.equal(foreignOnC.length, 1, 'prefix B must still reach its own client');

    const localOnA = track(instanceA.client, 'audit:local');
    const localOnB = track(instanceB.client, 'audit:local');
    const localOnC = track(instanceC.client, 'audit:local');
    instanceA.server.to(ROOM).emit('audit:local', { from: 'A' });
    await delay(600);
    assert.equal(localOnA.length, 1);
    assert.equal(localOnB.length, 1, 'replica A must reach replica B');
    assert.equal(localOnC.length, 0, 'prefix A must not reach prefix B clients');

    // 4. Every observed channel/pattern is inside a configured ACL namespace;
    //    the adapter's default `socket.io#…` prefix must never be used.
    const patterns = redis.state.psubscribe;
    const channels = [...redis.state.subscribe, ...redis.state.publish];
    assert.ok(patterns.length >= 3, 'each replica must install a psubscribe pattern');
    assert.equal(
      patterns.some((pattern) => pattern.startsWith('socket.io#')),
      false,
      'default Socket.IO channel namespace escapes the Redis ACL prefix',
    );
    assert.equal(
      channels.some((channel) => channel.startsWith('socket.io#')),
      false,
      'subscribe/publish channels must be namespaced',
    );
    assert.ok(
      patterns.filter((pattern) => pattern.startsWith(PREFIX_A)).length >= 2,
      'both replicas must share the same channel namespace',
    );
    assert.ok(
      patterns.some((pattern) => pattern.startsWith(PREFIX_B)),
      'the second namespace must be distinct',
    );
    for (const channel of redis.state.publish) {
      assert.ok(
        channel.startsWith(PREFIX_A) || channel.startsWith(PREFIX_B),
        `unexpected publish channel ${channel}`,
      );
    }

    // 5. Production source must use the adapter `key` option; ioredis
    //    `keyPrefix` does not apply to PUBLISH/(P)SUBSCRIBE commands.
    const adapterSource = readFileSync(
      join(root, 'src', 'redis', 'redis-io.adapter.ts'),
      'utf8',
    );
    assert.match(adapterSource, /createAdapter\(pubClient, subClient, \{/u);
    assert.match(adapterSource, /key:\s*config\.keyPrefix/u);
    assert.equal(/keyPrefix:\s*config\.keyPrefix/u.test(adapterSource), false);
    const mainSource = readFileSync(join(root, 'src', 'main.ts'), 'utf8');
    assert.match(mainSource, /redisIoAdapter\.connectToRedis\(\)/u);
    assert.match(mainSource, /useWebSocketAdapter\(redisIoAdapter\)/u);

    // 6. Deployment configuration exposes the fail-closed switch.
    const envExample = readFileSync(join(root, '..', '.env.example'), 'utf8');
    assert.match(envExample, /SOCKETIO_REQUIRE_SHARED_ADAPTER/u);
    assert.match(envExample, /adapter `key` option/u);
    for (const composeFile of ['docker-compose.yml', 'docker-compose.prod.yml']) {
      const compose = readFileSync(join(root, '..', composeFile), 'utf8');
      assert.match(compose, /SOCKETIO_REQUIRE_SHARED_ADAPTER/u, composeFile);
    }

    // 7. Fail-closed policy: unavailable Redis either degrades (default) or
    //    aborts startup when horizontal scaling is required.
    setRedisEnvironment(await findDeadPort(), PREFIX_A);
    delete process.env.SOCKETIO_REQUIRE_SHARED_ADAPTER;
    const graceful = new RedisIoAdapter(undefined as unknown as INestApplicationContext);
    await withTimeout(graceful.connectToRedis(), 6000, 'graceful fallback');
    assert.equal(graceful.getMode(), 'in_memory');
    await graceful.close();

    process.env.SOCKETIO_REQUIRE_SHARED_ADAPTER = 'true';
    const required = new RedisIoAdapter(undefined as unknown as INestApplicationContext);
    await assert.rejects(
      () => withTimeout(required.connectToRedis(), 6000, 'required shared adapter'),
      /shared Redis adapter is required/u,
    );
    assert.equal(required.getMode(), 'in_memory');
    await required.close();

    await assert.rejects(
      () => controller.getReadiness(),
      (error: unknown) => {
        assert.equal((error as { getStatus?: () => number }).getStatus?.(), 503);
        return true;
      },
    );

    process.env.SOCKETIO_REQUIRE_SHARED_ADAPTER = 'yes';
    const invalid = new RedisIoAdapter(undefined as unknown as INestApplicationContext);
    await assert.rejects(
      () => invalid.connectToRedis(),
      /SOCKETIO_REQUIRE_SHARED_ADAPTER must be either/u,
    );
    await invalid.close();

    console.log(
      `Socket.IO shared adapter check passed (3 replicas, ${patterns.length} psubscribe patterns, ` +
        `${redis.state.publish.length} publishes, cross-instance room delivery + namespace isolation + fail-closed policy).`,
    );
  } finally {
    for (const instance of instances.reverse()) {
      try {
        await closeInstance(instance);
      } catch {
        // Best-effort cleanup; the assertion above already reported the cause.
      }
    }
    if (redis) await redis.close();
    for (const name of ENV_NAMES) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    resetActiveSocketIoAdapterMode();
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
