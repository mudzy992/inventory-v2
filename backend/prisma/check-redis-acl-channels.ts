import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { INestApplicationContext } from '@nestjs/common';
import Redis from 'ioredis';
import {
  SOCKETIO_NAMESPACES,
  assertAclChannelCoverage,
  buildSocketIoChannelContract,
  parseAclChannelPatterns,
  parseAclKeyPatterns,
  parseAclRuleTokens,
} from '../src/redis/socketio-channel-contract.util';
import { RedisIoAdapter } from '../src/redis/redis-io.adapter';
import { resetActiveSocketIoAdapterMode } from '../src/redis/socketio-adapter.registry';

/**
 * Reproduces the deployment incident
 *   ReplyError: NOPERM No permissions to access a channel
 *     command: { name: 'psubscribe', args: [ 'inventory-v2:#/#*' ] }
 * against a REAL Redis 7 ACL, then proves the documented ACL rule and the
 * runtime preflight fix it. Requires a Redis service (CI provides one);
 * `--static` runs only the repository contract checks.
 */

const PREFIX = 'inventory-v2';
const KEY_PREFIX = `${PREFIX}:`;
const GOOD_USER = 'acl_probe_socketio_ok';
const NARROW_USER = 'acl_probe_socketio_narrow';
const LEGACY_USER = 'acl_probe_socketio_legacy';
const ACL_TEMPLATE = join('..', 'deploy', 'redis', 'users.acl.example');
const ADAPTER_ENV = [
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

/**
 * Faithful copy of the reported production `ACL GETUSER inventory-v2` rule
 * (before the fix): a tight command allowlist, both key namespaces, the
 * `&inventory-v2:*` glob and the OLD `socket.io…` exact channel grants from
 * the adapter's default `key`. It proves the incident and that adding only
 * the two new exact `&` grants is sufficient — no `+@all` needed.
 */
const LEGACY_RULE = [
  '-@all',
  '+@read', '+@write', '+@keyspace', '+@string', '+@list', '+@stream',
  '+@sortedset', '+@hash', '+@blocking', '+@pubsub',
  '-@admin', '-@dangerous',
  '-flushall', '-flushdb', '-shutdown', '-config', '-debug', '-keys',
  '+ping', '+info', '+eval', '+evalsha', '+client|setname',
  '~inventory-v2:*', '~bull:inventory-v2:*',
  '&inventory-v2:*', '&bull:inventory-v2:*',
  '&socket.io#/#*', '&socket.io#/notifications#*',
  '&socket.io-request#/#*', '&socket.io-request#/notifications#*',
  '&socket.io-response#/#*', '&socket.io-response#/notifications#*',
] as const;

const host = process.env.REDIS_HOST ?? '127.0.0.1';
const port = Number(process.env.REDIS_PORT ?? '6379');
const password = () => randomBytes(18).toString('hex');

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      timer.unref();
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};

const expectsNoperM = async (work: Promise<unknown>, label: string): Promise<void> => {
  try {
    await work;
  } catch (error) {
    assert.match(
      (error as Error).message,
      /NOPERM.*No permissions to access a (?:channel|key)/iu,
      `${label} must fail with the reported NOPERM channel error`,
    );
    return;
  }
  assert.fail(`${label} unexpectedly succeeded`);
};

const staticChecks = (root: string): void => {
  const aclText = readFileSync(resolve(root, ACL_TEMPLATE), 'utf8');
  const contract = buildSocketIoChannelContract(KEY_PREFIX);
  const channelPatterns = parseAclChannelPatterns(aclText, PREFIX);
  const keyPatterns = parseAclKeyPatterns(aclText, PREFIX);
  const ruleTokens = parseAclRuleTokens(aclText, PREFIX);

  // 1. The canonical rule really covers the pattern from the crash report.
  assert.equal(contract.psubscribePattern, 'inventory-v2:#/#*');
  assert.deepEqual(
    channelPatterns,
    contract.requiredAclPatterns.map((pattern) => pattern.slice(1)),
    'the canonical ACL must contain the glob AND an exact & grant per PSUBSCRIBE pattern',
  );
  assert.deepEqual(keyPatterns, ['inventory-v2:*']);
  assertAclChannelCoverage(contract, channelPatterns);
  assert.ok(ruleTokens.includes('+@pubsub') || ruleTokens.includes('+@all'));

  // The declared Socket.IO namespaces must match the ACL contract exactly:
  // Redis 7 compares PSUBSCRIBE patterns literally, so a new namespace needs
  // a new & grant (src/acl.c: ACLCheckChannelAgainstList, is_pattern branch).
  const gateway = readFileSync(
    resolve(root, 'src', 'modules', 'notifications', 'notifications.gateway.ts'),
    'utf8',
  );
  const declared = [...gateway.matchAll(/namespace:\s*'([^']+)'/gu)].map((match) =>
    match[1].startsWith('/') ? match[1] : `/${match[1]}`,
  );
  assert.deepEqual(['/', ...declared], [...SOCKETIO_NAMESPACES]);

  // 2. The documented prefix must match the application's env examples.
  const envExample = readFileSync(resolve(root, '..', '.env.example'), 'utf8');
  assert.match(envExample, /REDIS_KEY_PREFIX=inventory-v2\b/u);
  // The operator runbook must keep the migration path for pre-existing ACLs
  // (additive ACL SETUSER + ACL SAVE, legacy socket.io grants explained).
  const guide = readFileSync(resolve(root, '..', 'docs', 'redis-acl.md'), 'utf8');
  assert.match(guide, /ACL SAVE/u);
  assert.match(guide, /ACL SETUSER inventory-v2/u);
  assert.match(guide, /socket\.io#\/#\*/u);
  assert.match(envExample, /&<PREFIX>:\*|&inventory-v2:\*/u);

  // 3. BullMQ must never receive maxRetriesPerRequest: 3 (the runtime warning).
  const scan = [
    resolve(root, 'src'),
    resolve(root, 'prisma'),
    resolve(root, '..', 'document-worker', 'src'),
  ];
  const offenders: string[] = [];
  const collect = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) collect(full);
      else if (entry.name.endsWith('.ts')) {
        const source = readFileSync(full, 'utf8');
        if (/connection:\s*build(?:Base)?RedisOptions\(/u.test(source)) {
          offenders.push(full);
        }
      }
    }
  };
  for (const dir of scan) collect(dir);
  assert.deepEqual(offenders, [], 'BullMQ connections must use buildBullMqRedisOptions()');

  const bullmqModule = readFileSync(resolve(root, 'src', 'queues', 'bullmq.module.ts'), 'utf8');
  const eventsService = readFileSync(
    resolve(root, 'src', 'modules', 'documents', 'document-conversion-events.service.ts'),
    'utf8',
  );
  const worker = readFileSync(
    resolve(root, '..', 'document-worker', 'src', 'worker.ts'),
    'utf8',
  );
  for (const [label, source] of [
    ['BullModule', bullmqModule],
    ['QueueEvents', eventsService],
    ['document-worker', worker],
  ] as const) {
    assert.match(source, /buildBullMqRedisOptions\(/u, `${label} must use BullMQ retry options`);
  }
};

const setAdapterEnvironment = (user: string, pass: string, requireShared: boolean): void => {
  process.env.REDIS_HOST = host;
  process.env.REDIS_PORT = String(port);
  process.env.REDIS_USERNAME = user;
  process.env.REDIS_PASSWORD = pass;
  process.env.REDIS_DB = '0';
  process.env.REDIS_KEY_PREFIX = PREFIX;
  process.env.REDIS_TLS = 'false';
  delete process.env.REDIS_CA_CERT_PATH;
  if (requireShared) process.env.SOCKETIO_REQUIRE_SHARED_ADAPTER = 'true';
  else delete process.env.SOCKETIO_REQUIRE_SHARED_ADAPTER;
};

const liveChecks = async (root: string): Promise<void> => {
  const aclText = readFileSync(resolve(root, ACL_TEMPLATE), 'utf8');
  const ruleTokens = parseAclRuleTokens(aclText, PREFIX);
  const contract = buildSocketIoChannelContract(KEY_PREFIX);
  const goodPassword = password();
  const narrowPassword = password();
  const legacyPassword = password();
  const open: Redis[] = [];
  const adapters: RedisIoAdapter[] = [];
  const previous = new Map(ADAPTER_ENV.map((name) => [name, process.env[name]]));

  const makeClient = (user: string, pass: string): Redis => {
    const client = new Redis({
      host,
      port,
      username: user,
      password: pass,
      db: 0,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: false,
    });
    client.on('error', () => {});
    open.push(client);
    return client;
  };

  let admin: Redis | undefined;
  try {
    admin = new Redis({
      host,
      port,
      username: process.env.REDIS_ADMIN_USERNAME || undefined,
      password: process.env.REDIS_ADMIN_PASSWORD || undefined,
      db: 0,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: false,
    });
    admin.on('error', () => {});
    open.push(admin);

    const pong = await withTimeout(admin.ping(), 6000, 'Redis PING');
    assert.equal(pong, 'PONG');

    // 1. Canonical ACL from deploy/redis/users.acl.example (both axes granted).
    await admin.call(
      'ACL',
      'SETUSER',
      GOOD_USER,
      'on',
      `>${goodPassword}`,
      'resetkeys',
      'resetchannels',
      ...ruleTokens,
    );
    // 2. The exact ACL reported from production: it already has
    //    &inventory-v2:* and legacy &socket.io… exact grants, but no grant
    //    equals the NEW inventory-v2:#/… psubscribe patterns.
    await admin.call(
      'ACL',
      'SETUSER',
      LEGACY_USER,
      'on',
      `>${legacyPassword}`,
      'resetkeys',
      'resetchannels',
      ...LEGACY_RULE,
    );
    // 3. Deliberately under-scoped ACL: key access, but only BullMQ-ish channels.
    await admin.call(
      'ACL',
      'SETUSER',
      NARROW_USER,
      'on',
      `>${narrowPassword}`,
      'resetkeys',
      'resetchannels',
      `~${KEY_PREFIX}*`,
      `&${KEY_PREFIX}bull*`,
      '+@all',
    );
    const aclInfo = String(await admin.call('ACL', 'GETUSER', GOOD_USER));
    assert.match(aclInfo, /inventory-v2:\*/u, 'canonical ACL must actually contain the channel grant');

    // 4. The documented user can perform every Pub/Sub operation the adapter needs.
    const goodSub = makeClient(GOOD_USER, goodPassword);
    const goodCmd = makeClient(GOOD_USER, goodPassword);
    await withTimeout(
      goodSub.psubscribe(...contract.psubscribePatterns),
      6000,
      'good PSUBSCRIBE',
    );
    await withTimeout(
      goodSub.subscribe(...contract.subscribeChannels),
      6000,
      'good SUBSCRIBE',
    );
    const delivered = withTimeout(
      new Promise<void>((resolveDelivery) => {
        goodSub.on('pmessage', (_pattern: string, channel: string, message: string) => {
          if (channel === `${KEY_PREFIX}#/#acl-probe-message` && message === 'ok') {
            resolveDelivery();
          }
        });
      }),
      6000,
      'ACL-guarded Pub/Sub delivery',
    );
    const receivers = await withTimeout(
      goodCmd.publish(`${KEY_PREFIX}#/#acl-probe-message`, 'ok'),
      6000,
      'good PUBLISH',
    );
    assert.ok(receivers >= 1, 'the psubscribe pattern must receive the published message');
    await delivered;
    await withTimeout(
      goodCmd.publish(contract.publishProbeChannel, 'acl-probe'),
      6000,
      'good PUBLISH probe channel',
    );
    await withTimeout(goodCmd.set(`${KEY_PREFIX}acl_probe`, '1'), 6000, 'good SET');
    await expectsNoperM(
      goodCmd.set('other-deployment:acl_probe', '1'),
      'key outside the ACL key pattern',
    );
    await goodCmd.del(`${KEY_PREFIX}acl_probe`);

    // 5. The reported production ACL reproduces the exact NOPERM error:
    //    PUBLISH/SUBSCRIBE work, but neither &inventory-v2:* nor the old
    //    &socket.io#/#* grants equal the new PSUBSCRIBE patterns.
    const legacySub = makeClient(LEGACY_USER, legacyPassword);
    await expectsNoperM(
      withTimeout(
        legacySub.psubscribe(...contract.psubscribePatterns),
        6000,
        'legacy ACL PSUBSCRIBE',
      ),
      'production ACL psubscribe',
    );
    const legacyCmd = makeClient(LEGACY_USER, legacyPassword);
    await withTimeout(
      legacyCmd.publish(`${KEY_PREFIX}#/#legacy-probe`, 'x'),
      6000,
      'legacy ACL PUBLISH',
    );

    // 5b. The recommended minimal fix: a purely ADDITIVE ACL SETUSER with the
    //     two exact patterns. No command/key changes, no ACL LOAD restart.
    await admin.call(
      'ACL',
      'SETUSER',
      LEGACY_USER,
      ...contract.requiredAclPatterns,
    );
    const fixedInfo = String(await admin.call('ACL', 'GETUSER', LEGACY_USER));
    for (const pattern of contract.requiredAclPatterns) {
      assert.ok(fixedInfo.includes(pattern), `runtime ACL must now contain ${pattern}`);
    }
    const fixedSub = makeClient(LEGACY_USER, legacyPassword);
    await withTimeout(
      fixedSub.psubscribe(...contract.psubscribePatterns),
      6000,
      'fixed legacy ACL PSUBSCRIBE',
    );
    setAdapterEnvironment(LEGACY_USER, legacyPassword, false);
    const fixedAdapter = new RedisIoAdapter(undefined as unknown as INestApplicationContext);
    adapters.push(fixedAdapter);
    await withTimeout(fixedAdapter.connectToRedis(), 10_000, 'fixed legacy adapter startup');
    assert.equal(
      fixedAdapter.getMode(),
      'shared_redis',
      'the minimal two-grant fix must restore the shared adapter',
    );

    // 6. The narrow ACL is denied on both pub/sub directions.
    const narrowSub = makeClient(NARROW_USER, narrowPassword);
    await expectsNoperM(
      withTimeout(
        narrowSub.psubscribe(...contract.psubscribePatterns),
        6000,
        'narrow PSUBSCRIBE',
      ),
      'narrow ACL psubscribe',
    );
    const narrowCmd = makeClient(NARROW_USER, narrowPassword);
    await expectsNoperM(
      withTimeout(
        narrowCmd.publish(`${KEY_PREFIX}#/#denied`, 'x'),
        6000,
        'narrow PUBLISH',
      ),
      'narrow ACL publish',
    );

    // 7. Runtime preflight: canonical user gets shared_redis; narrow user
    //    degrades instead of crashing the process with an unhandled ReplyError.
    //    (The fixed legacy user was already proven in step 5b.)
    setAdapterEnvironment(GOOD_USER, goodPassword, false);
    const healthy = new RedisIoAdapter(undefined as unknown as INestApplicationContext);
    adapters.push(healthy);
    await withTimeout(healthy.connectToRedis(), 10_000, 'canonical-user adapter startup');
    assert.equal(healthy.getMode(), 'shared_redis');

    setAdapterEnvironment(NARROW_USER, narrowPassword, false);
    const degraded = new RedisIoAdapter(undefined as unknown as INestApplicationContext);
    adapters.push(degraded);
    await withTimeout(degraded.connectToRedis(), 10_000, 'narrow-user adapter startup');
    assert.equal(degraded.getMode(), 'in_memory', 'ACL denial must degrade, not crash');

    setAdapterEnvironment(NARROW_USER, narrowPassword, true);
    const failClosed = new RedisIoAdapter(undefined as unknown as INestApplicationContext);
    adapters.push(failClosed);
    await assert.rejects(
      withTimeout(failClosed.connectToRedis(), 10_000, 'fail-closed adapter startup'),
      /shared Redis adapter is required/u,
    );

    console.log(
      `Redis ACL channel check passed (${contract.requiredAclPatterns.length} canonical & grants, ` +
        `literal PSUBSCRIBE matching + minimal two-grant fix proven on real Redis 7, ` +
        `adapter preflight degrades instead of crashing, BullMQ retry policy enforced).`,
    );
  } catch (error) {
    if ((error as Error).message.includes('timed out') && /PING/u.test((error as Error).message)) {
      throw new Error(
        `Redis ACL check requires a reachable Redis service at ${host}:${port} ` +
          `(CI provides one; locally use --static). Cause: ${(error as Error).message}`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    for (const adapter of adapters) await adapter.close();
    // ACL cleanup must happen while the admin connection is still alive.
    if (admin?.status === 'ready') {
      await admin.call('ACL', 'DELUSER', GOOD_USER).catch(() => undefined);
      await admin.call('ACL', 'DELUSER', NARROW_USER).catch(() => undefined);
      await admin.call('ACL', 'DELUSER', LEGACY_USER).catch(() => undefined);
    }
    for (const client of open) client.disconnect();
    for (const name of ADAPTER_ENV) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    resetActiveSocketIoAdapterMode();
  }
};

const main = async (): Promise<void> => {
  const root = resolve('.');
  staticChecks(root);
  if (process.argv.includes('--static')) {
    console.log('Redis ACL contract check passed (static repository policy; live ACL part skipped).');
    return;
  }
  await liveChecks(root);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
