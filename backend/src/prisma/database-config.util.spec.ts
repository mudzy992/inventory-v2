import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  DEFAULT_DATABASE_POOL_MAX,
  MAX_DATABASE_POOL_MAX,
  resolveDatabaseConfig,
  resolveDatabasePoolMax,
} from './database-config.util';

describe('resolveDatabaseConfig', () => {
  it('preserves PostgreSQL URL fields and defaults to TLS off for local compatibility', () => {
    const config = resolveDatabaseConfig({
      DATABASE_URL: 'postgresql://inventory_user:p%40ss@db.internal:5433/inventory?schema=public',
    });

    assert.deepEqual(config, {
      host: 'db.internal',
      port: 5433,
      user: 'inventory_user',
      password: 'p@ss',
      database: 'inventory',
      ssl: undefined,
    });
  });

  it('enables peer-verified TLS from DATABASE_SSL_MODE and loads a mounted CA', () => {
    const directory = mkdtempSync(join(tmpdir(), 'inventory-postgres-ca-'));
    const caPath = join(directory, 'postgres-ca.crt');
    const ca = '-----BEGIN CERTIFICATE-----\nsynthetic-test-ca\n-----END CERTIFICATE-----\n';
    writeFileSync(caPath, ca);

    try {
      const config = resolveDatabaseConfig({
        DATABASE_HOST: 'db.internal',
        DATABASE_PORT: '5432',
        DATABASE_USER: 'inventory_user',
        DATABASE_PASSWORD: 'test-password',
        DATABASE_NAME: 'inventory',
        DATABASE_SSL_MODE: 'verify-full',
        DATABASE_SSL_CA: caPath,
      });

      assert.deepEqual(config.ssl, {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        ca,
        servername: 'db.internal',
      });
      assert.equal(readFileSync(caPath, 'utf8'), ca);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps peer verification for every enabled sslmode', () => {
    for (const mode of ['require', 'verify-ca', 'verify-full'] as const) {
      const config = resolveDatabaseConfig({
        DATABASE_URL: `postgresql://user:password@db.internal/inventory?sslmode=${mode}`,
      });
      assert.equal(config.ssl?.rejectUnauthorized, true, mode);
      assert.equal(config.ssl?.minVersion, 'TLSv1.2', mode);
      assert.equal(config.ssl?.servername, 'db.internal', mode);
      assert.equal(config.ssl?.ca, undefined, mode);
    }
  });

  it('omits SNI for IP hosts so the certificate IP SAN is checked instead', () => {
    const config = resolveDatabaseConfig({
      DATABASE_URL: 'postgresql://user:password@10.20.30.40:5432/inventory?sslmode=verify-full',
    });
    assert.deepEqual(config.ssl, { rejectUnauthorized: true, minVersion: 'TLSv1.2' });
    assert.equal('servername' in (config.ssl ?? {}), false);
  });

  it('rejects a URL or env sslmode that tries to turn verified TLS off', () => {
    assert.throws(
      () =>
        resolveDatabaseConfig({
          DATABASE_URL: 'postgresql://user:password@db.internal/inventory?sslmode=disable',
          DATABASE_SSL_MODE: 'verify-full',
        }),
      /Conflicting PostgreSQL sslmode/,
    );
    assert.throws(
      () =>
        resolveDatabaseConfig({
          DATABASE_URL: 'postgresql://user:password@db.internal/inventory?sslmode=verify-full',
          DATABASE_SSL_MODE: 'disable',
        }),
      /Conflicting PostgreSQL sslmode/,
    );
  });

  it('lets the deployment-wide mode win when both sides only request verified TLS', () => {
    const config = resolveDatabaseConfig({
      DATABASE_URL: 'postgresql://user:password@db.internal/inventory?sslmode=require',
      DATABASE_SSL_MODE: 'verify-full',
    });
    assert.equal(config.ssl?.rejectUnauthorized, true);
    assert.equal(config.ssl?.minVersion, 'TLSv1.2');
  });

  it('falls back to DATABASE_SSL_CA when the URL has an empty sslrootcert', () => {
    const directory = mkdtempSync(join(tmpdir(), 'inventory-postgres-empty-ca-'));
    const caPath = join(directory, 'postgres-ca.crt');
    writeFileSync(caPath, 'deployment CA');
    try {
      const config = resolveDatabaseConfig({
        DATABASE_URL: 'postgresql://user:password@db.internal/inventory?sslmode=verify-full&sslrootcert=',
        DATABASE_SSL_CA: caPath,
      });
      assert.equal(config.ssl?.ca, 'deployment CA');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('accepts the standard sslmode and sslrootcert URL parameters', () => {
    const directory = mkdtempSync(join(tmpdir(), 'inventory-postgres-url-ca-'));
    const caPath = join(directory, 'postgres-ca.crt');
    const ca = 'synthetic URL CA';
    writeFileSync(caPath, ca);

    try {
      const config = resolveDatabaseConfig({
        DATABASE_URL: `postgresql://user:password@db.internal/inventory?sslmode=verify-ca&sslrootcert=${encodeURIComponent(caPath)}`,
      });
      assert.deepEqual(config.ssl, {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        ca,
        servername: 'db.internal',
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects downgrade-prone or unsupported sslmode values', () => {
    assert.throws(
      () =>
        resolveDatabaseConfig({
          DATABASE_URL: 'postgresql://user:password@db.internal/inventory?sslmode=prefer',
        }),
      /Unsupported PostgreSQL sslmode/,
    );
    assert.throws(
      () =>
        resolveDatabaseConfig({
          DATABASE_HOST: 'db.internal',
          DATABASE_USER: 'user',
          DATABASE_PASSWORD: 'password',
          DATABASE_NAME: 'inventory',
          DATABASE_SSL_MODE: 'no-verify',
        }),
      /Unsupported PostgreSQL sslmode/,
    );
  });

  it('requires TLS to be enabled when a CA file is configured', () => {
    assert.throws(
      () =>
        resolveDatabaseConfig({
          DATABASE_HOST: 'db.internal',
          DATABASE_USER: 'user',
          DATABASE_PASSWORD: 'password',
          DATABASE_NAME: 'inventory',
          DATABASE_SSL_CA: '/unused/postgres-ca.crt',
        }),
      /requires PostgreSQL TLS to be enabled/,
    );
  });
});

describe('resolveDatabasePoolMax', () => {
  it('uses the documented default when the deployment does not set a pool size', () => {
    assert.equal(resolveDatabasePoolMax({}), DEFAULT_DATABASE_POOL_MAX);
    assert.equal(resolveDatabasePoolMax({ DATABASE_POOL_MAX: '   ' }), DEFAULT_DATABASE_POOL_MAX);
  });

  it('accepts a validated deployment-specific pool size', () => {
    assert.equal(resolveDatabasePoolMax({ DATABASE_POOL_MAX: '3' }), 3);
    assert.equal(
      resolveDatabasePoolMax({ DATABASE_POOL_MAX: String(MAX_DATABASE_POOL_MAX) }),
      MAX_DATABASE_POOL_MAX,
    );
  });

  it('rejects values that could silently or catastrophically exhaust PostgreSQL connections', () => {
    for (const value of ['0', '-1', '101', '3.5', 'ten', '1e2', '9007199254740992']) {
      assert.throws(
        () => resolveDatabasePoolMax({ DATABASE_POOL_MAX: value }),
        /DATABASE_POOL_MAX must be an integer between 1 and 100/,
      );
    }
  });
});
