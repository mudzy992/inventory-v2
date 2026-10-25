import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { bullmqPrefix, buildRedisOptions } from './redis-connection';
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
    assert.notEqual(options.tls?.rejectUnauthorized, false);
    assert.equal(options.maxRetriesPerRequest, 3);
    assert.equal(options.enableReadyCheck, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('buildRedisOptions leaves TLS disabled only when explicitly configured off', () => {
  assert.equal(buildRedisOptions(baseConfig).tls, undefined);
  assert.deepEqual(buildRedisOptions({ ...baseConfig, tls: true }).tls, {});
});

test('bullmqPrefix removes the trailing separator for BullMQ namespace handling', () => {
  assert.equal(bullmqPrefix(baseConfig), 'inventory-v2');
});
