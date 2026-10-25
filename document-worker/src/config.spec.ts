import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from './config';

const CONFIG_ENV_NAMES = [
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_USERNAME',
  'REDIS_PASSWORD',
  'REDIS_DB',
  'REDIS_KEY_PREFIX',
  'REDIS_TLS',
  'REDIS_CA_CERT_PATH',
  'DOCUMENT_QUEUE_NAME',
  'UPLOAD_DIR',
  'DOCUMENT_WORKER_TMP_DIR',
  'DOCUMENT_WORKER_CONCURRENCY',
  'DOCUMENT_WORKER_CONVERT_TIMEOUT_MS',
  'DOCUMENT_WORKER_HEALTH_PORT',
  'DOCUMENT_WORKER_SOFFICE_BIN',
] as const;

type ConfigEnvironment = Partial<Record<(typeof CONFIG_ENV_NAMES)[number], string>>;

const withConfigEnvironment = (values: ConfigEnvironment, run: () => void): void => {
  const previous = new Map(CONFIG_ENV_NAMES.map((name) => [name, process.env[name]]));
  for (const name of CONFIG_ENV_NAMES) {
    delete process.env[name];
  }
  Object.assign(process.env, values);

  try {
    run();
  } finally {
    for (const name of CONFIG_ENV_NAMES) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
};

test('loadConfig provides safe development defaults', () => {
  withConfigEnvironment({}, () => {
    assert.deepEqual(loadConfig(), {
      redis: {
        host: 'redis-core',
        port: 6379,
        username: undefined,
        password: undefined,
        db: 0,
        keyPrefix: 'inventory-v2:',
        tls: false,
        caCertPath: undefined,
      },
      queueName: 'document-generation',
      uploadDir: '/app/uploads',
      tmpDir: '/tmp/document-worker',
      concurrency: 2,
      convertTimeoutMs: 120_000,
      healthPort: 8080,
      sofficeBinary: 'soffice',
    });
  });
});

test('loadConfig reads Redis TLS, credentials, queue, paths, and worker limits', () => {
  withConfigEnvironment(
    {
      REDIS_HOST: 'redis.internal',
      REDIS_PORT: '6380',
      REDIS_USERNAME: 'worker',
      REDIS_PASSWORD: 'secret',
      REDIS_DB: '3',
      REDIS_KEY_PREFIX: 'test::',
      REDIS_TLS: 'true',
      REDIS_CA_CERT_PATH: ' /run/certs/redis-ca.pem ',
      DOCUMENT_QUEUE_NAME: 'documents-test',
      UPLOAD_DIR: '/data/uploads',
      DOCUMENT_WORKER_TMP_DIR: '/data/tmp',
      DOCUMENT_WORKER_CONCURRENCY: '4',
      DOCUMENT_WORKER_CONVERT_TIMEOUT_MS: '90000',
      DOCUMENT_WORKER_HEALTH_PORT: '8090',
      DOCUMENT_WORKER_SOFFICE_BIN: '/usr/bin/soffice',
    },
    () => {
      assert.deepEqual(loadConfig(), {
        redis: {
          host: 'redis.internal',
          port: 6380,
          username: 'worker',
          password: 'secret',
          db: 3,
          keyPrefix: 'test:',
          tls: true,
          caCertPath: '/run/certs/redis-ca.pem',
        },
        queueName: 'documents-test',
        uploadDir: '/data/uploads',
        tmpDir: '/data/tmp',
        concurrency: 4,
        convertTimeoutMs: 90_000,
        healthPort: 8090,
        sofficeBinary: '/usr/bin/soffice',
      });
    },
  );
});

test('loadConfig falls back rather than partially parsing malformed integer values', () => {
  withConfigEnvironment(
    {
      REDIS_PORT: '6379junk',
      REDIS_DB: '-1',
      DOCUMENT_WORKER_CONCURRENCY: '2.5',
      DOCUMENT_WORKER_CONVERT_TIMEOUT_MS: '999999999999999999999',
      DOCUMENT_WORKER_HEALTH_PORT: '0',
    },
    () => {
      const config = loadConfig();
      assert.equal(config.redis.port, 6379);
      assert.equal(config.redis.db, 0);
      assert.equal(config.concurrency, 2);
      assert.equal(config.convertTimeoutMs, 120_000);
      assert.equal(config.healthPort, 8080);
    },
  );
});
