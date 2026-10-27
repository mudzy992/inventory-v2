import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  REQUIRED_DOCS,
  REQUIRED_REPO_KNOBS,
  checkRepositoryPolicy,
  evaluateDeployment,
  formatReport,
  parseEnvFile,
} from './check-deployment-readiness.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const GOOD = {
  NODE_ENV: 'production',
  VITE_APP_URL: 'https://app.example.com',
  CORS_ORIGIN: 'https://app.example.com',
  JWT_SECRET: 'a'.repeat(48),
  SETUP_TOKEN: 'bootstrap-token-abcdef-123456',
  DATABASE_SSL_MODE: 'verify-full',
  DATABASE_SSL_CA: '/run/secrets/postgres-ca.crt',
  DATABASE_URL: 'postgresql://u:p@db.example.com:5432/inventory?schema=public',
  DATABASE_POOL_MAX: '10',
  REDIS_TLS: 'false',
  REDIS_HOST: 'redis-core',
  REDIS_CA_CERT_PATH: '',
  REDIS_KEY_PREFIX: 'inventory-v2',
  REDIS_USERNAME: '',
  BACKEND_REPLICAS: '1',
  SOCKETIO_REQUIRE_SHARED_ADAPTER: 'false',
  SECURITY_HEADERS_ENABLED: 'true',
  HSTS_MAX_AGE_SECONDS: '15552000',
  GLOBAL_RATE_LIMIT_ENABLED: 'false',
  GLOBAL_RATE_LIMIT_MAX: '300',
  GLOBAL_RATE_LIMIT_WINDOW_SEC: '60',
  GLOBAL_RATE_LIMIT_FAIL_CLOSED: 'false',
  PUBLIC_EQUIPMENT_MAX_MOVEMENTS: '200',
  TRANSFER_RAW_DOCUMENT_DISPOSITION: 'attachment',
};

const statusOf = (result, id) => result.checks.find((check) => check.id === id)?.status;
const withOverrides = (overrides) => ({ ...GOOD, ...overrides });

const withTempRoot = (work) => {
  const directory = mkdtempSync(join(tmpdir(), 'inventory-readiness-'));
  try {
    for (const relative of [
      '.env.example',
      'docker-compose.yml',
      'docker-compose.prod.yml',
      'deploy/redis/users.acl.example',
      ...REQUIRED_DOCS,
    ]) {
      const target = join(directory, relative);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(root, relative), target);
    }
    return work(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

test('parseEnvFile handles comments, export, quotes and invalid keys', () => {
  const parsed = parseEnvFile(
    [
      '# comment',
      '',
      'export A=1',
      'B="two words"',
      "C='single'",
      'D=plain # inline kept as value',
      'lower-name=ignored',
      'NO_EQUALS',
    ].join('\n'),
  );
  assert.deepEqual(parsed, {
    A: '1',
    B: 'two words',
    C: 'single',
    D: 'plain # inline kept as value',
  });
});

test('repository policy passes on the real checkout', () => {
  const result = checkRepositoryPolicy(root);
  assert.equal(result.summary.fail, 0, formatReport(result));
  assert.equal(result.checks.length, 11);
  assert.ok(REQUIRED_REPO_KNOBS.length >= 17);
});

test('a hardened deployment has no failures (only explicit MANUAL warnings)', () => {
  const result = evaluateDeployment(GOOD);
  assert.equal(result.summary.fail, 0, formatReport(result));
  assert.deepEqual(
    result.checks.filter((check) => check.status === 'warn').map((check) => check.id),
    ['db-cert-san'],
  );
});

test('--strict turns MANUAL warnings into failures', () => {
  const normal = evaluateDeployment(GOOD);
  const strict = evaluateDeployment(GOOD, { strict: true });
  assert.equal(normal.summary.fail, 0);
  assert.equal(strict.summary.fail, normal.summary.warn);
  assert.equal(strict.summary.warn, 0);
});

test('missing/placeholder secrets and open setup fail', () => {
  for (const overrides of [
    { JWT_SECRET: '' },
    { JWT_SECRET: 'short' },
    { JWT_SECRET: 'changeme-please-replace-me-now-1234' },
    { SETUP_TOKEN: '' },
    { SETUP_TOKEN: 'abc' },
  ]) {
    const result = evaluateDeployment(withOverrides(overrides));
    assert.ok(
      statusOf(result, 'jwt-secret') === 'fail' || statusOf(result, 'setup-token') === 'fail',
      JSON.stringify(overrides),
    );
  }
});

test('CORS rejects wildcard, empty, path, trailing slash and http in production', () => {
  for (const origin of ['*', '', 'https://app.example.com/', 'https://app.example.com/path', 'http://app.example.com']) {
    assert.equal(statusOf(evaluateDeployment(withOverrides({ CORS_ORIGIN: origin })), 'cors-origin'), 'fail', origin);
  }
  const multi = evaluateDeployment(
    withOverrides({ CORS_ORIGIN: 'https://app.example.com, https://admin.example.com' }),
  );
  assert.equal(statusOf(multi, 'cors-origin'), 'pass');
  const mismatch = evaluateDeployment(withOverrides({ VITE_APP_URL: 'https://evil.example.com' }));
  assert.equal(statusOf(mismatch, 'cors-frontend-match'), 'fail');
});

test('database TLS mode and DATABASE_URL sslmode conflict are detected', () => {
  assert.equal(statusOf(evaluateDeployment(withOverrides({ DATABASE_SSL_MODE: 'disable' })), 'db-ssl-mode'), 'fail');
  assert.equal(statusOf(evaluateDeployment(withOverrides({ DATABASE_SSL_MODE: 'verify-ca' })), 'db-ssl-mode'), 'pass');
  const conflict = evaluateDeployment(
    withOverrides({ DATABASE_URL: 'postgresql://u:p@db:5432/x?sslmode=disable' }),
  );
  assert.equal(statusOf(conflict, 'db-url-ssl-conflict'), 'fail');
  const relativeCa = evaluateDeployment(withOverrides({ DATABASE_SSL_CA: 'certs/ca.crt' }));
  assert.equal(statusOf(relativeCa, 'db-ca-mount'), 'fail');
});

test('Redis TLS requires a mounted CA and a DNS host', () => {
  const full = evaluateDeployment(
    withOverrides({
      REDIS_TLS: 'true',
      REDIS_HOST: 'redis.example.com',
      REDIS_CA_CERT_PATH: '/run/secrets/redis-ca.crt',
      REDIS_USERNAME: 'inventory-v2',
    }),
  );
  assert.equal(statusOf(full, 'redis-tls'), 'pass');
  assert.equal(statusOf(full, 'redis-cert-san'), 'warn');
  assert.equal(statusOf(full, 'redis-acl-channels'), 'warn');
  for (const overrides of [
    { REDIS_HOST: '127.0.0.1' },
    { REDIS_CA_CERT_PATH: 'ca.crt' },
    { REDIS_CA_CERT_PATH: '' },
  ]) {
    const result = evaluateDeployment(
      withOverrides({ REDIS_TLS: 'true', REDIS_HOST: 'redis.example.com', REDIS_CA_CERT_PATH: '/etc/ssl/ca.crt', ...overrides }),
    );
    assert.equal(statusOf(result, 'redis-tls'), 'fail', JSON.stringify(overrides));
  }
});

test('multi-replica deployments require the fail-closed shared adapter', () => {
  const bad = evaluateDeployment(withOverrides({ BACKEND_REPLICAS: '3' }));
  assert.equal(statusOf(bad, 'socketio-shared-adapter'), 'fail');
  const good = evaluateDeployment(
    withOverrides({ BACKEND_REPLICAS: '3', SOCKETIO_REQUIRE_SHARED_ADAPTER: 'true' }),
  );
  assert.equal(statusOf(good, 'socketio-shared-adapter'), 'pass');
});

test('pool budget, headers, HSTS, rate-limit and QR cap bounds are enforced', () => {
  assert.equal(statusOf(evaluateDeployment(withOverrides({ DATABASE_POOL_MAX: '900' })), 'pool-budget'), 'fail');
  assert.equal(statusOf(evaluateDeployment(withOverrides({ DATABASE_POOL_MAX: '60', BACKEND_REPLICAS: '3' })), 'pool-budget'), 'warn');
  assert.equal(statusOf(evaluateDeployment(withOverrides({ SECURITY_HEADERS_ENABLED: 'false' })), 'security-headers'), 'warn');
  assert.equal(statusOf(evaluateDeployment(withOverrides({ HSTS_MAX_AGE_SECONDS: '999999999' })), 'hsts'), 'fail');
  assert.equal(statusOf(evaluateDeployment(withOverrides({ HSTS_MAX_AGE_SECONDS: '0' })), 'hsts'), 'warn');
  assert.equal(statusOf(evaluateDeployment(withOverrides({ GLOBAL_RATE_LIMIT_MAX: '0' })), 'global-rate-limit'), 'fail');
  const enabled = evaluateDeployment(withOverrides({ GLOBAL_RATE_LIMIT_ENABLED: 'true' }));
  assert.equal(statusOf(enabled, 'global-rate-limit-fail-open'), 'warn');
  assert.equal(statusOf(evaluateDeployment(withOverrides({ PUBLIC_EQUIPMENT_MAX_MOVEMENTS: '5000' })), 'public-qr-cap'), 'fail');
});

test('raw HTML disposition is validated and inline mode warns', () => {
  assert.equal(statusOf(evaluateDeployment(GOOD), 'transfer-raw-disposition'), 'pass');
  assert.equal(
    statusOf(evaluateDeployment(withOverrides({ TRANSFER_RAW_DOCUMENT_DISPOSITION: 'inline' })), 'transfer-raw-disposition'),
    'warn',
  );
  assert.equal(
    statusOf(evaluateDeployment(withOverrides({ TRANSFER_RAW_DOCUMENT_DISPOSITION: 'download' })), 'transfer-raw-disposition'),
    'fail',
  );
});

test('formatReport never prints secret values but includes remediation for failures', () => {
  const result = evaluateDeployment(withOverrides({ JWT_SECRET: 'short' }));
  const report = formatReport(result);
  assert.match(report, /FAIL/u);
  assert.match(report, /openssl rand -hex 32/u);
  assert.equal(report.includes(GOOD.SETUP_TOKEN), false);
  assert.equal(report.includes('a'.repeat(48)), false);
});

test('repo policy mutation: removing an exact ACL grant fails the gate', () => {
  withTempRoot((directory) => {
    const aclPath = join(directory, 'deploy/redis/users.acl.example');
    const source = readFileSync(aclPath, 'utf8');
    const mutated = source.replaceAll('&<PREFIX>:#/notifications#*', '');
    writeFileSync(aclPath, mutated);
    const result = checkRepositoryPolicy(directory);
    assert.equal(statusOf(result, 'repo-redis-acl-template'), 'fail');
  });
});

test('repo policy mutation: unsafe compose default is rejected', () => {
  withTempRoot((directory) => {
    const composePath = join(directory, 'docker-compose.yml');
    writeFileSync(
      composePath,
      readFileSync(composePath, 'utf8').replace('DATABASE_SSL_MODE:-verify-full', 'DATABASE_SSL_MODE:-disable'),
    );
    const result = checkRepositoryPolicy(directory);
    assert.equal(statusOf(result, 'repo-safe-defaults-coolify'), 'fail');
  });
});

test('repo policy mutation: a missing operator guide is rejected', () => {
  withTempRoot((directory) => {
    rmSync(join(directory, 'docs/http-hardening.md'));
    const result = checkRepositoryPolicy(directory);
    assert.equal(statusOf(result, 'repo-operator-guides'), 'fail');
  });
});
