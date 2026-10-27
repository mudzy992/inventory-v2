import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildBaseRedisOptions,
  buildBullMqRedisOptions,
  buildRedisTlsOptions,
  readRedisConfig,
} from './redis.config';

const REDIS_ENV_NAMES = [
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_USERNAME',
  'REDIS_PASSWORD',
  'REDIS_DB',
  'REDIS_KEY_PREFIX',
  'REDIS_TLS',
  'REDIS_CA_CERT_PATH',
] as const;

type RedisEnvironment = Partial<Record<(typeof REDIS_ENV_NAMES)[number], string>>;

const withRedisEnvironment = (values: RedisEnvironment, run: () => void): void => {
  const previous = new Map(REDIS_ENV_NAMES.map((name) => [name, process.env[name]]));
  for (const name of REDIS_ENV_NAMES) delete process.env[name];
  Object.assign(process.env, values);

  try {
    run();
  } finally {
    for (const name of REDIS_ENV_NAMES) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
};

test('readRedisConfig supplies compatible defaults', () => {
  withRedisEnvironment({}, () => {
    assert.deepEqual(readRedisConfig(), {
      host: 'redis-core',
      port: 6379,
      username: undefined,
      password: undefined,
      db: 0,
      keyPrefix: 'inventory-v2:',
      tls: false,
      caCertPath: undefined,
    });
  });
});

test('readRedisConfig parses explicit TLS and trims the CA path', () => {
  withRedisEnvironment(
    {
      REDIS_HOST: 'redis.internal',
      REDIS_PORT: '6380',
      REDIS_USERNAME: 'inventory',
      REDIS_PASSWORD: 'test-secret',
      REDIS_DB: '2',
      REDIS_KEY_PREFIX: 'test::',
      REDIS_TLS: 'true',
      REDIS_CA_CERT_PATH: ' /run/secrets/redis-ca.pem ',
    },
    () => {
      assert.deepEqual(readRedisConfig(), {
        host: 'redis.internal',
        port: 6380,
        username: 'inventory',
        password: 'test-secret',
        db: 2,
        keyPrefix: 'test:',
        tls: true,
        caCertPath: '/run/secrets/redis-ca.pem',
      });
    },
  );
});

test('readRedisConfig rejects malformed, unsafe, or out-of-range numeric values', () => {
  const invalidValues: Array<[keyof RedisEnvironment, string]> = [
    ['REDIS_PORT', '6379junk'],
    ['REDIS_PORT', '0'],
    ['REDIS_PORT', '65536'],
    ['REDIS_DB', '-1'],
    ['REDIS_DB', '1.5'],
    ['REDIS_DB', '9007199254740992'],
  ];

  for (const [name, value] of invalidValues) {
    withRedisEnvironment({ [name]: value }, () => {
      assert.throws(() => readRedisConfig(), new RegExp(name, 'u'));
    });
  }
});

test('readRedisConfig accepts only explicit true/false TLS values', () => {
  for (const value of ['TRUE', 'yes', '1', 'enabled']) {
    withRedisEnvironment({ REDIS_TLS: value }, () => {
      assert.throws(() => readRedisConfig(), /REDIS_TLS/u);
    });
  }
});

test('buildBaseRedisOptions keeps TLS peer verification and loads a configured CA', () => {
  const directory = mkdtempSync(join(tmpdir(), 'inventory-redis-config-'));
  const caPath = join(directory, 'redis-ca.pem');
  const ca = 'synthetic test CA';
  writeFileSync(caPath, ca);

  try {
    const options = buildBaseRedisOptions({
      host: 'redis.internal',
      port: 6380,
      db: 0,
      keyPrefix: 'inventory-v2:',
      tls: true,
      caCertPath: caPath,
    });
    assert.ok(options.tls);
    assert.deepEqual(options.tls.ca, readFileSync(caPath));
    assert.equal(options.tls.rejectUnauthorized, true);
    assert.equal(options.tls.minVersion, 'TLSv1.2');
    assert.equal(options.tls.servername, 'redis.internal');
    assert.equal(options.tls.checkServerIdentity, undefined);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('buildRedisTlsOptions never emits a verification bypass and honours IP SAN hosts', () => {
  const withoutTls = buildRedisTlsOptions({ tls: false, host: 'redis.internal' });
  assert.equal(withoutTls, undefined);

  const dnsHost = buildRedisTlsOptions({ tls: true, host: 'redis.internal' });
  assert.deepEqual(dnsHost, {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
    servername: 'redis.internal',
  });

  const ipHost = buildRedisTlsOptions({ tls: true, host: '10.20.30.40' });
  assert.deepEqual(ipHost, { rejectUnauthorized: true, minVersion: 'TLSv1.2' });
  assert.equal('servername' in (ipHost ?? {}), false);
});

test('buildBullMqRedisOptions satisfies BullMQ and keeps every other option identical', () => {
  const config = {
    host: 'redis.internal',
    port: 6380,
    db: 2,
    keyPrefix: 'inventory-v2:',
    tls: false,
  };
  const base = buildBaseRedisOptions(config);
  const bullmq = buildBullMqRedisOptions(config);
  assert.equal(base.maxRetriesPerRequest, 3, 'plain clients must fail fast');
  assert.equal(bullmq.maxRetriesPerRequest, null, 'BullMQ must not warn/override a retry limit');
  assert.equal(bullmq.enableReadyCheck, true);
  assert.equal(bullmq.host, base.host);
  assert.equal(bullmq.port, base.port);
  assert.equal(bullmq.db, base.db);
  assert.equal(bullmq.tls, base.tls);
  assert.equal(typeof bullmq.retryStrategy, typeof base.retryStrategy);
});
