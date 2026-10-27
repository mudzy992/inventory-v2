import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  bullmqPrefix,
  buildBullMqRedisOptions,
  buildRedisOptions,
  buildRedisTlsOptions,
} from './redis-connection';
import type { WorkerConfig } from './config';

const baseConfig: WorkerConfig['redis'] = {
  host: 'redis.internal',
  port: 6379,
  username: 'worker',
  password: 'test-secret',
  db: 0,
  keyPrefix: 'inventory-v2:',
  tls: false,
};

test('buildRedisOptions preserves peer verification and loads a private CA', () => {
  const directory = mkdtempSync(join(tmpdir(), 'document-worker-redis-'));
  const caPath = join(directory, 'redis-ca.pem');
  writeFileSync(caPath, 'synthetic test CA');

  try {
    const options = buildRedisOptions({ ...baseConfig, tls: true, caCertPath: caPath });
    assert.deepEqual(options.tls?.ca, readFileSync(caPath));
    assert.equal(options.tls?.rejectUnauthorized, true);
    assert.equal(options.tls?.minVersion, 'TLSv1.2');
    assert.equal(options.tls?.servername, 'redis.internal');
    assert.equal(options.tls?.checkServerIdentity, undefined);
    assert.equal(options.maxRetriesPerRequest, 3);
    assert.equal(options.enableReadyCheck, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('buildRedisOptions leaves TLS disabled only when explicitly configured off', () => {
  assert.equal(buildRedisOptions(baseConfig).tls, undefined);
  assert.deepEqual(buildRedisOptions({ ...baseConfig, tls: true }).tls, {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
    servername: 'redis.internal',
  });
});

test('buildRedisTlsOptions matches backend verification semantics for DNS and IP hosts', () => {
  assert.equal(buildRedisTlsOptions({ tls: false, host: 'redis.internal' }), undefined);
  assert.deepEqual(buildRedisTlsOptions({ tls: true, host: 'redis.internal' }), {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
    servername: 'redis.internal',
  });
  assert.deepEqual(buildRedisTlsOptions({ tls: true, host: '127.0.0.1' }), {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
  });
});

test('bullmqPrefix removes the trailing separator for BullMQ namespace handling', () => {
  assert.equal(bullmqPrefix(baseConfig), 'inventory-v2');
});

test('buildBullMqRedisOptions overrides only the BullMQ retry limit', () => {
  const plain = buildRedisOptions(baseConfig);
  const bullmq = buildBullMqRedisOptions(baseConfig);
  assert.equal(plain.maxRetriesPerRequest, 3);
  assert.equal(bullmq.maxRetriesPerRequest, null);
  assert.equal(bullmq.enableReadyCheck, true);
  assert.equal(bullmq.host, plain.host);
  assert.equal(bullmq.port, plain.port);
  assert.equal(bullmq.db, plain.db);
  assert.equal(bullmq.tls, plain.tls);
});
