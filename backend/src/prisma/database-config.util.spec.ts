import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { resolveDatabaseConfig } from './database-config.util';

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

      assert.deepEqual(config.ssl, { rejectUnauthorized: true, ca });
      assert.equal(readFileSync(caPath, 'utf8'), ca);
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
      assert.deepEqual(config.ssl, { rejectUnauthorized: true, ca });
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
