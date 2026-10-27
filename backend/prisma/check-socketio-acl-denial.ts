import assert from 'node:assert/strict';
import type { INestApplicationContext } from '@nestjs/common';
import { buildSocketIoChannelContract } from '../src/redis/socketio-channel-contract.util';
import { RedisIoAdapter } from '../src/redis/redis-io.adapter';
import { resetActiveSocketIoAdapterMode } from '../src/redis/socketio-adapter.registry';
import { startRespPubSubServer, type RespPubSubServer } from './utils/resp-pubsub-test-server.util';

/**
 * Proves, without a Redis binary, that a `NOPERM No permissions to access a
 * channel` on `psubscribe <prefix>:#/#*` no longer kills the process: the
 * adapter preflight catches it, emits one structured operator-facing event
 * and degrades to in_memory (or fails startup when the shared adapter is
 * required). The live Redis 7 ACL proof is check-redis-acl-channels.ts.
 */

const PREFIX = 'inventory-v2:';
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

interface CapturedLine {
  level: string;
  line: string;
}

const capture = (adapter: RedisIoAdapter): CapturedLine[] => {
  const lines: CapturedLine[] = [];
  (adapter as unknown as { logger: Record<string, (line: string) => void> }).logger = {
    log: (line) => lines.push({ level: 'log', line }),
    warn: (line) => lines.push({ level: 'warn', line }),
    error: (line) => lines.push({ level: 'error', line }),
    debug: (line) => lines.push({ level: 'debug', line }),
  };
  return lines;
};

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      timer.unref();
    }),
  ]);

const main = async (): Promise<void> => {
  const contract = buildSocketIoChannelContract(PREFIX);
  const previous = new Map(ENV_NAMES.map((name) => [name, process.env[name]]));
  const servers: RespPubSubServer[] = [];
  const adapters: RedisIoAdapter[] = [];

  const setEnvironment = (port: number, requireShared: boolean): void => {
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = String(port);
    process.env.REDIS_USERNAME = 'inventory-v2';
    process.env.REDIS_PASSWORD = 'test-secret';
    process.env.REDIS_DB = '0';
    process.env.REDIS_KEY_PREFIX = 'inventory-v2';
    process.env.REDIS_TLS = 'false';
    delete process.env.REDIS_CA_CERT_PATH;
    if (requireShared) process.env.SOCKETIO_REQUIRE_SHARED_ADAPTER = 'true';
    else delete process.env.SOCKETIO_REQUIRE_SHARED_ADAPTER;
  };

  const createAdapter = (): { adapter: RedisIoAdapter; lines: CapturedLine[] } => {
    const adapter = new RedisIoAdapter(undefined as unknown as INestApplicationContext);
    adapters.push(adapter);
    return { adapter, lines: capture(adapter) };
  };

  try {
    // 1. Control: a normal Redis grants the channels and the preflight passes.
    const granted = await startRespPubSubServer();
    servers.push(granted);
    setEnvironment(granted.port, false);
    const healthy = createAdapter();
    await withTimeout(healthy.adapter.connectToRedis(), 6000, 'granted startup');
    assert.equal(healthy.adapter.getMode(), 'shared_redis');
    assert.ok(
      granted.state.psubscribe.includes(contract.psubscribePattern),
      'the preflight must exercise the exact production psubscribe pattern',
    );
    assert.ok(
      granted.state.publish.includes(contract.publishProbeChannel),
      'the preflight must exercise PUBLISH permission',
    );
    assert.ok(
      healthy.lines.some(({ line }) => line.includes('socketio_redis_adapter_connected')),
      'a granted ACL must still install the shared adapter',
    );

    // 2. Denied: the same pattern is rejected with the production NOPERM reply.
    const denied = await startRespPubSubServer({
      denyChannels: [contract.psubscribePattern],
    });
    servers.push(denied);
    setEnvironment(denied.port, false);
    const degraded = createAdapter();
    await withTimeout(degraded.adapter.connectToRedis(), 6000, 'denied startup');
    assert.equal(degraded.adapter.getMode(), 'in_memory', 'NOPERM must degrade, not crash');
    assert.equal(denied.state.publish.length, 0, 'no PUBLISH may be attempted after NOPERM');
    const aclLog = degraded.lines.find(({ line }) => line.includes('socketio_redis_acl_denied'));
    assert.ok(aclLog, 'must emit a structured socketio_redis_acl_denied event');
    assert.equal(aclLog.level, 'error');
    for (const expected of [
      'inventory-v2',
      '&inventory-v2:*',
      'NOPERM',
    ]) {
      assert.ok(aclLog.line.includes(expected), `operator log must mention ${expected}`);
    }
    assert.ok(
      degraded.lines.some(({ line }) => line.includes('socketio_redis_adapter_fallback')),
      'the fallback event must still be emitted',
    );

    // 3. Fail-closed: multi-replica deployments must not silently degrade.
    setEnvironment(denied.port, true);
    const failClosed = createAdapter();
    await assert.rejects(
      withTimeout(failClosed.adapter.connectToRedis(), 6000, 'fail-closed startup'),
      /shared Redis adapter is required/u,
    );
    assert.equal(failClosed.adapter.getMode(), 'in_memory');

    console.log(
      'Socket.IO ACL denial check passed (NOPERM on inventory-v2:#/#* degrades with an operator-facing event, fail-closed policy preserved).',
    );
  } finally {
    for (const adapter of adapters) await adapter.close();
    for (const server of servers) await server.close();
    for (const name of ENV_NAMES) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    resetActiveSocketIoAdapterMode();
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
