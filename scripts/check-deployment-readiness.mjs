#!/usr/bin/env node
/**
 * Deployment readiness contract.
 *
 * Every earlier hardening package left a small "owner/deployment" tail: real
 * CA mounts, cert SAN/HOST matching, Redis ACL prefix, proxy/CORS, secrets,
 * header/rate-limit/cap flags and replica-aware Socket.IO. This tool turns
 * that tail into ONE executable report.
 *
 *   node scripts/check-deployment-readiness.mjs                 # repo policy
 *   node scripts/check-deployment-readiness.mjs --env .env     # live values
 *   node scripts/check-deployment-readiness.mjs --env .env --json --strict
 *
 * Repo mode runs in CI (no secrets needed). `--env` mode is for the operator
 * on the actual server; it never prints secret values, only PASS/WARN/FAIL.
 * Dependency free: only node: builtins.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_REPO_KNOBS = [
  'JWT_SECRET',
  'SETUP_TOKEN',
  'CORS_ORIGIN',
  'DATABASE_SSL_MODE',
  'DATABASE_SSL_CA',
  'DATABASE_POOL_MAX',
  'REDIS_TLS',
  'REDIS_CA_CERT_PATH',
  'REDIS_KEY_PREFIX',
  'SOCKETIO_REQUIRE_SHARED_ADAPTER',
  'SECURITY_HEADERS_ENABLED',
  'HSTS_MAX_AGE_SECONDS',
  'GLOBAL_RATE_LIMIT_ENABLED',
  'GLOBAL_RATE_LIMIT_MAX',
  'GLOBAL_RATE_LIMIT_WINDOW_SEC',
  'GLOBAL_RATE_LIMIT_FAIL_CLOSED',
  'PUBLIC_EQUIPMENT_MAX_MOVEMENTS',
  'TRANSFER_RAW_DOCUMENT_DISPOSITION',
  'DOCUMENT_JOB_STALE_TIMEOUT_MS',
];

export const REQUIRED_DOCS = [
  'docs/redis-acl.md',
  'docs/http-hardening.md',
  'docs/public-qr-privacy.md',
  'docs/upload-read-policy.md',
  'docs/transfer-document-security.md',
  'docs/queue-recovery.md',
  'docs/performance-budgets.md',
  'docs/backend-code-audit-2026-10-27.md',
  'docs/deployment-readiness.md',
];

export const SAFE_COMPOSE_DEFAULTS = [
  'DATABASE_SSL_MODE:-verify-full',
  'GLOBAL_RATE_LIMIT_ENABLED:-false',
  'SECURITY_HEADERS_ENABLED:-true',
  'PUBLIC_EQUIPMENT_MAX_MOVEMENTS:-200',
  'SOCKETIO_REQUIRE_SHARED_ADAPTER:-false',
  'DATABASE_POOL_MAX:-10',
  'TRANSFER_RAW_DOCUMENT_DISPOSITION:-attachment',
  'DOCUMENT_JOB_STALE_TIMEOUT_MS:-1800000',
];

export const CA_MOUNT_PREFIXES = ['/run/secrets/', '/etc/ssl/'];
export const DB_TLS_MODES = ['require', 'verify-ca', 'verify-full'];

const makeResult = () => ({ checks: [], summary: { pass: 0, warn: 0, fail: 0, skip: 0 } });

const add = (result, id, status, message, remediation) => {
  result.checks.push({ id, status, message, ...(remediation ? { remediation } : {}) });
  result.summary[status] += 1;
};

const finish = (result, { strict = false } = {}) => {
  if (strict) {
    for (const check of result.checks) {
      if (check.status === 'warn') check.status = 'fail';
    }
    result.summary.fail += result.summary.warn;
    result.summary.warn = 0;
  }
  return result;
};

const value = (env, key) => (env[key] ?? '').trim();

const isPlaceholder = (raw) =>
  /change[_-]?me|replace[_-]?me|placeholder|example|changeme|secret123|your[-_]?pass|\bpassword\b/i.test(
    raw,
  );

const isAbsoluteCaPath = (raw) =>
  raw.startsWith('/') && CA_MOUNT_PREFIXES.some((prefix) => raw.startsWith(prefix));

const isDnsHost = (raw) =>
  raw.length > 0 &&
  !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(raw) &&
  !raw.includes(':') &&
  /^[a-z0-9.-]+$/iu.test(raw);

const intInRange = (raw, min, max) => {
  if (!/^\d+$/u.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
};

export function parseEnvFile(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const withouExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separator = withouExport.indexOf('=');
    const key = withouExport.slice(0, separator).trim();
    let raw = withouExport.slice(separator + 1).trim();
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      raw = raw.slice(1, -1);
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) env[key] = raw;
  }
  return env;
}

/** Evaluate actual deployment values. Pure: no fs, no network, no secrets in output. */
export function evaluateDeployment(env, options = {}) {
  const result = makeResult();
  const isProduction = value(env, 'NODE_ENV') !== 'development';
  const tlsConfirmed = value(env, 'TLS_VERIFIED').toLowerCase() === 'true';

  // --- Bootstrap / identity -------------------------------------------------
  const nodeEnv = value(env, 'NODE_ENV');
  if (!nodeEnv) {
    add(result, 'node-env', 'skip', 'NODE_ENV not in env file (compose sets it to production)');
  } else {
    add(
      result,
      'node-env',
      nodeEnv === 'production' ? 'pass' : 'warn',
      nodeEnv === 'production' ? 'NODE_ENV=production' : `NODE_ENV=${nodeEnv} (expected production)`,
      'Set NODE_ENV=production in the compose/Coolify service.',
    );
  }

  const jwt = value(env, 'JWT_SECRET');
  add(
    result,
    'jwt-secret',
    jwt.length >= 32 && !isPlaceholder(jwt) ? 'pass' : 'fail',
    jwt.length >= 32 && !isPlaceholder(jwt)
      ? 'JWT_SECRET is set and has a safe length'
      : 'JWT_SECRET is missing, shorter than 32 chars or a placeholder',
    'Generate e.g. `openssl rand -hex 32` and set JWT_SECRET.',
  );

  const setupToken = value(env, 'SETUP_TOKEN');
  add(
    result,
    'setup-token',
    setupToken.length >= 16 && !isPlaceholder(setupToken) ? 'pass' : 'fail',
    setupToken.length >= 16 && !isPlaceholder(setupToken)
      ? 'SETUP_TOKEN is set (setup bootstrap is protected)'
      : 'SETUP_TOKEN is missing/too short/placeholder — /setup/initialize must not be open',
    'Set a random SETUP_TOKEN of at least 16 characters before first deploy.',
  );

  // --- CORS / proxy ---------------------------------------------------------
  const corsRaw = value(env, 'CORS_ORIGIN');
  const origins = corsRaw.split(',').map((origin) => origin.trim()).filter(Boolean);
  const originPattern = /^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/iu;
  const corsOk =
    origins.length > 0 &&
    !origins.includes('*') &&
    (!isProduction || origins.every((origin) => originPattern.test(origin)));
  add(
    result,
    'cors-origin',
    corsOk ? 'pass' : 'fail',
    corsOk
      ? `CORS_ORIGIN has ${origins.length} explicit HTTPS origin(s)`
      : 'CORS_ORIGIN is empty, wildcard, has a path/trailing slash or is not HTTPS',
    'Set CORS_ORIGIN to the exact frontend origin(s), e.g. https://app.example.com.',
  );

  const appUrl = value(env, 'VITE_APP_URL');
  if (!appUrl) {
    add(result, 'cors-frontend-match', 'skip', 'VITE_APP_URL not provided');
  } else {
    let appOrigin = appUrl;
    try {
      appOrigin = new URL(appUrl).origin;
    } catch {
      appOrigin = appUrl;
    }
    const matches = origins.includes(appOrigin);
    add(
      result,
      'cors-frontend-match',
      matches ? 'pass' : 'fail',
      matches ? 'Frontend origin is in CORS allow-list' : 'VITE_APP_URL origin is NOT in CORS_ORIGIN',
      'Align VITE_APP_URL and CORS_ORIGIN; otherwise the SPA cannot call the API.',
    );
  }

  // --- PostgreSQL TLS -------------------------------------------------------
  const dbMode = value(env, 'DATABASE_SSL_MODE');
  const dbModeOk = DB_TLS_MODES.includes(dbMode);
  add(
    result,
    'db-ssl-mode',
    dbModeOk ? 'pass' : 'fail',
    dbModeOk ? `DATABASE_SSL_MODE=${dbMode} verifies the peer` : `DATABASE_SSL_MODE=${dbMode || '(unset)'} disables or weakens TLS`,
    'Use require / verify-ca / verify-full; never disable in production.',
  );

  const dbUrl = value(env, 'DATABASE_URL');
  const urlMode = /[?&]sslmode=([^&\s]+)/u.exec(dbUrl)?.[1];
  const conflict =
    urlMode === 'disable' && dbModeOk ||
    (urlMode && urlMode !== 'disable' && dbMode === 'disable');
  add(
    result,
    'db-url-ssl-conflict',
    conflict ? 'fail' : 'pass',
    conflict
      ? `DATABASE_URL sslmode=${urlMode} conflicts with DATABASE_SSL_MODE=${dbMode} (app fails closed)`
      : 'DATABASE_URL and DATABASE_SSL_MODE agree about TLS',
    'Remove sslmode from DATABASE_URL or make it agree with DATABASE_SSL_MODE.',
  );

  const dbCa = value(env, 'DATABASE_SSL_CA');
  if (!dbCa) {
    add(result, 'db-ca-mount', 'pass', 'DATABASE_SSL_CA empty — system trust store will verify the peer');
  } else {
    add(
      result,
      'db-ca-mount',
      isAbsoluteCaPath(dbCa) ? 'pass' : 'fail',
      isAbsoluteCaPath(dbCa)
        ? 'DATABASE_SSL_CA points to a conventional read-only secret path'
        : 'DATABASE_SSL_CA must be an absolute path under /run/secrets/ or /etc/ssl/',
      'Mount the CA read-only into the backend container and set its absolute path.',
    );
  }
  if (dbModeOk) {
    add(
      result,
      'db-cert-san',
      tlsConfirmed ? 'pass' : 'warn',
      tlsConfirmed
        ? 'TLS active on PostgreSQL (confirmed by owner)'
        : 'MANUAL: confirm the PostgreSQL certificate SAN matches DATABASE_HOST',
      'Run `openssl s_client -starttls postgres -connect HOST:PORT` and compare SAN/CN, or set TLS_VERIFIED=true after confirming.',
    );
  }

  // --- Redis TLS / ACL ------------------------------------------------------
  const redisTls = value(env, 'REDIS_TLS') === 'true';
  const redisCa = value(env, 'REDIS_CA_CERT_PATH');
  if (!redisTls) {
    add(result, 'redis-tls', 'pass', 'REDIS_TLS=false (private network / no TLS configured)');
    add(result, 'redis-cert-san', 'pass', 'Redis TLS disabled — no certificate SAN to verify');
  } else {
    const host = value(env, 'REDIS_HOST');
    const ok = isAbsoluteCaPath(redisCa) && isDnsHost(host);
    add(
      result,
      'redis-tls',
      ok ? 'pass' : 'fail',
      ok
        ? 'REDIS_TLS has a mounted CA and a DNS host suitable for SNI'
        : 'REDIS_TLS=true needs REDIS_CA_CERT_PATH under /run/secrets|/etc/ssl and a DNS REDIS_HOST',
      'Mount redis-ca.crt read-only and use a DNS hostname (IP literals cannot be SNI-verified).',
    );
    add(
      result,
      'redis-cert-san',
      tlsConfirmed ? 'pass' : 'warn',
      tlsConfirmed
        ? 'TLS active on Redis (confirmed by owner)'
        : 'MANUAL: confirm the Redis certificate SAN matches REDIS_HOST',
      'Compare the server certificate SAN with REDIS_HOST; the app always verifies hostname, or set TLS_VERIFIED=true after confirming.',
    );
  }

  const prefix = value(env, 'REDIS_KEY_PREFIX');
  const prefixOk = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(prefix) && !prefix.includes(':');
  add(
    result,
    'redis-acl-prefix',
    prefixOk ? 'pass' : 'fail',
    prefixOk ? `REDIS_KEY_PREFIX=${prefix} is a valid namespace` : 'REDIS_KEY_PREFIX is empty or contains a colon',
    'Use REDIS_KEY_PREFIX=inventory-v2 (no trailing colon); the app adds it.',
  );
  if (value(env, 'REDIS_USERNAME')) {
    add(
      result,
      'redis-acl-channels',
      'warn',
      `MANUAL: ACL user must grant &${prefix}:* plus exact &${prefix}:#/#* and &${prefix}:#/notifications#*`,
      'Verify with `ACL GETUSER inventory-v2` — Redis 7 matches PSUBSCRIBE patterns literally.',
    );
  }

  // --- Replicas, pool, hardening flags -------------------------------------
  const replicasRaw = value(env, 'BACKEND_REPLICAS') || '1';
  const replicas = intInRange(replicasRaw, 1, 100) ?? 1;
  const requireShared = value(env, 'SOCKETIO_REQUIRE_SHARED_ADAPTER') === 'true';
  add(
    result,
    'socketio-shared-adapter',
    replicas > 1 && !requireShared ? 'fail' : 'pass',
    replicas > 1
      ? requireShared
        ? `${replicas} replicas with fail-closed shared adapter`
        : `${replicas} replicas but SOCKETIO_REQUIRE_SHARED_ADAPTER is not true`
      : 'Single replica (or BACKEND_REPLICAS unset)',
    'With >1 replica set SOCKETIO_REQUIRE_SHARED_ADAPTER=true and restart all replicas together.',
  );

  const pool = intInRange(value(env, 'DATABASE_POOL_MAX') || '10', 1, 100);
  const estimated = pool === null ? null : replicas * pool + 4;
  add(
    result,
    'pool-budget',
    pool === null ? 'fail' : estimated > 90 ? 'warn' : 'pass',
    pool === null
      ? 'DATABASE_POOL_MAX must be an integer 1–100'
      : `Estimated connections ≈ ${estimated} (${replicas} × ${pool} + worker/migrations/maintenance)`,
    'Keep replicas × DATABASE_POOL_MAX + 4 below PostgreSQL max_connections with reserve.',
  );

  const headersOff = value(env, 'SECURITY_HEADERS_ENABLED') === 'false';
  add(
    result,
    'security-headers',
    headersOff ? 'warn' : 'pass',
    headersOff ? 'SECURITY_HEADERS_ENABLED=false — security headers disabled' : 'Security headers enabled (or default)',
    'Leave SECURITY_HEADERS_ENABLED=true; see docs/http-hardening.md.',
  );

  const hsts = intInRange(value(env, 'HSTS_MAX_AGE_SECONDS') || '15552000', 0, 31536000);
  add(
    result,
    'hsts',
    hsts === null ? 'fail' : hsts === 0 ? 'warn' : 'pass',
    hsts === null ? 'HSTS_MAX_AGE_SECONDS must be 0–31536000' : `HSTS max-age=${hsts} (HTTPS requests only)`,
    'Use 0 only for local HTTP; production should keep ≥ 15552000.',
  );

  const globalEnabled = value(env, 'GLOBAL_RATE_LIMIT_ENABLED') === 'true';
  const globalMax = intInRange(value(env, 'GLOBAL_RATE_LIMIT_MAX') || '300', 1, 100000);
  const globalWindow = intInRange(value(env, 'GLOBAL_RATE_LIMIT_WINDOW_SEC') || '60', 1, 3600);
  add(
    result,
    'global-rate-limit',
    globalMax === null || globalWindow === null ? 'fail' : 'pass',
    globalMax === null || globalWindow === null
      ? 'Global rate-limit bounds are invalid'
      : `Global rate limit ${globalEnabled ? 'ENABLED' : 'opt-in/off'} (${globalMax}/${globalWindow}s)`,
    'Bounds: max 1–100000, window 1–3600. Enabled state is an owner decision.',
  );
  if (globalEnabled && value(env, 'GLOBAL_RATE_LIMIT_FAIL_CLOSED') !== 'true') {
    add(
      result,
      'global-rate-limit-fail-open',
      'warn',
      'Global rate limit fails OPEN on Redis outage (availability over protection)',
      'Set GLOBAL_RATE_LIMIT_FAIL_CLOSED=true if protection should win.',
    );
  }

  const rawDisposition = value(env, 'TRANSFER_RAW_DOCUMENT_DISPOSITION') || 'attachment';
  const dispositionValid = rawDisposition === 'attachment' || rawDisposition === 'inline';
  add(
    result,
    'transfer-raw-disposition',
    !dispositionValid ? 'fail' : rawDisposition === 'inline' ? 'warn' : 'pass',
    !dispositionValid
      ? 'TRANSFER_RAW_DOCUMENT_DISPOSITION must be attachment or inline'
      : rawDisposition === 'inline'
        ? 'RAW HTML document renders inline (strict CSP + sandbox still enforced)'
        : 'RAW HTML document is served as a download (attachment)',
    'Prefer attachment; inline still has hash-based CSP, sandbox and escaping.',
  );

  const staleMs = intInRange(value(env, 'DOCUMENT_JOB_STALE_TIMEOUT_MS') || '1800000', 300000, 86400000);
  const convertMs = intInRange(value(env, 'DOCUMENT_WORKER_CONVERT_TIMEOUT_MS') || '120000', 1000, 3600000);
  const staleValid = staleMs !== null && convertMs !== null;
  const staleAfterWorker = staleValid && staleMs > convertMs + 30000;
  add(
    result,
    'document-job-stale-bound',
    !staleValid ? 'fail' : staleAfterWorker ? 'pass' : 'warn',
    !staleValid
      ? 'DOCUMENT_JOB_STALE_TIMEOUT_MS must be 300000–86400000 and convert timeout 1000–3600000'
      : staleAfterWorker
        ? `Stuck DocumentJob recovery bound ${staleMs}ms > worker timeout ${convertMs}ms + 30s lock slack`
        : `Stale bound ${staleMs}ms is not after worker timeout ${convertMs}ms + 30s — legitimate conversions could be killed`,
    'Set DOCUMENT_JOB_STALE_TIMEOUT_MS well above DOCUMENT_WORKER_CONVERT_TIMEOUT_MS + 30000.',
  );

  const qrCap = intInRange(value(env, 'PUBLIC_EQUIPMENT_MAX_MOVEMENTS') || '200', 1, 1000);
  add(
    result,
    'public-qr-cap',
    qrCap === null ? 'fail' : 'pass',
    qrCap === null
      ? 'PUBLIC_EQUIPMENT_MAX_MOVEMENTS must be 1–1000'
      : `Public QR movement history capped at ${qrCap}`,
    'Keep the cap at/below 1000; see docs/public-qr-privacy.md.',
  );

  return finish(result, options);
}

/** Static repository policy — safe to run in CI without any secret. */
export function checkRepositoryPolicy(root) {
  const result = makeResult();
  const read = (relative) => readFileSync(join(root, relative), 'utf8');
  const envExample = read('.env.example');
  const coolify = read('docker-compose.yml');
  const standalone = read('docker-compose.prod.yml');

  const missingKnobs = REQUIRED_REPO_KNOBS.filter((knob) => !envExample.includes(`${knob}=`));
  add(
    result,
    'repo-env-knobs',
    missingKnobs.length === 0 ? 'pass' : 'fail',
    missingKnobs.length === 0
      ? `.env.example documents all ${REQUIRED_REPO_KNOBS.length} deployment knobs`
      : `.env.example missing: ${missingKnobs.join(', ')}`,
  );

  const missingCoolify = REQUIRED_REPO_KNOBS.filter((knob) => !coolify.includes(knob));
  add(
    result,
    'repo-coolify-knobs',
    missingCoolify.length === 0 ? 'pass' : 'fail',
    missingCoolify.length === 0
      ? 'docker-compose.yml exposes every deployment knob'
      : `docker-compose.yml missing: ${missingCoolify.join(', ')}`,
  );

  for (const [label, source] of [
    ['coolify', coolify],
    ['standalone', standalone],
  ]) {
    const badDefaults = SAFE_COMPOSE_DEFAULTS.filter((entry) => !source.includes(entry));
    add(
      result,
      `repo-safe-defaults-${label}`,
      badDefaults.length === 0 ? 'pass' : 'fail',
      badDefaults.length === 0
        ? `${label} compose keeps safe defaults`
        : `${label} compose missing safe defaults: ${badDefaults.join(', ')}`,
    );
    add(
      result,
      `repo-node-env-${label}`,
      /NODE_ENV[:=]\s*production/u.test(source) ? 'pass' : 'fail',
      /NODE_ENV[:=]\s*production/u.test(source)
        ? `${label} compose sets NODE_ENV=production`
        : `${label} compose does not set NODE_ENV=production`,
    );
    add(
      result,
      `repo-ca-path-${label}`,
      source.includes('REDIS_CA_CERT_PATH') && source.includes('DATABASE_SSL_CA') ? 'pass' : 'fail',
      `${label} compose exposes both CA path variables`,
    );
  }

  const acl = read('deploy/redis/users.acl.example');
  // Validate the actual `user ...` rule, not the explanatory comments.
  const aclRuleLine = acl.split(/\r?\n/u).find((line) => /^\s*user\s+/iu.test(line)) ?? '';
  const aclOk =
    aclRuleLine.includes('&<PREFIX>:#/#*') &&
    aclRuleLine.includes('&<PREFIX>:#/notifications#*') &&
    aclRuleLine.includes('&<PREFIX>:*') &&
    aclRuleLine.includes('+info');
  add(
    result,
    'repo-redis-acl-template',
    aclOk ? 'pass' : 'fail',
    aclOk
      ? 'Canonical ACL template has the glob + both exact PSUBSCRIBE grants + +info'
      : 'Canonical ACL template is missing a required channel grant or +info',
  );

  const missingDocs = REQUIRED_DOCS.filter((relative) => !existsSync(join(root, relative)));
  add(
    result,
    'repo-operator-guides',
    missingDocs.length === 0 ? 'pass' : 'fail',
    missingDocs.length === 0
      ? `All ${REQUIRED_DOCS.length} operator guides are present`
      : `Missing guides: ${missingDocs.join(', ')}`,
  );

  const prefixMatch =
    /REDIS_KEY_PREFIX=inventory-v2\b/u.test(envExample) &&
    coolify.includes('REDIS_KEY_PREFIX=${REDIS_KEY_PREFIX:-inventory-v2}');
  add(
    result,
    'repo-prefix-alignment',
    prefixMatch ? 'pass' : 'fail',
    prefixMatch ? 'REDIS_KEY_PREFIX default matches the documented ACL namespace' : 'REDIS_KEY_PREFIX default drifted from the ACL namespace',
  );

  return finish(result);
}

export const formatReport = (result) => {
  const { pass, warn, fail, skip } = result.summary;
  const verdict = fail > 0 ? 'FAIL' : warn > 0 ? 'PASS WITH WARNINGS' : 'PASS';
  const lines = [
    `Deployment readiness: ${verdict} (${pass} pass, ${warn} warn, ${fail} fail, ${skip} skip)`,
  ];
  for (const check of result.checks) {
    lines.push(`  [${check.status.toUpperCase().padEnd(4)}] ${check.id}: ${check.message}`);
    if (check.status === 'fail' && check.remediation) {
      lines.push(`         → ${check.remediation}`);
    }
  }
  return lines.join('\n');
};

const main = () => {
  const args = process.argv.slice(2);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  if (args.includes('--help')) {
    console.log(
      'Usage: node scripts/check-deployment-readiness.mjs [--env .env] [--json] [--strict]\n' +
        '  no --env : validate repository compose/.env.example/docs policy (CI mode)\n' +
        '  --env    : additionally evaluate actual deployment values\n' +
        '  --strict : treat warnings as failures',
    );
    return 0;
  }
  const envIndex = args.indexOf('--env');
  const envPath = envIndex === -1 ? null : args[envIndex + 1];
  const strict = args.includes('--strict');
  const json = args.includes('--json');
  const results = [];
  if (!envPath) results.push(checkRepositoryPolicy(root));
  if (envPath) {
    if (!existsSync(resolve(envPath))) {
      console.error(`Env file not found: ${envPath}`);
      return 1;
    }
    results.push(evaluateDeployment(parseEnvFile(readFileSync(resolve(envPath), 'utf8')), { strict }));
    results.push(checkRepositoryPolicy(root));
  }
  const merged = results.reduce(
    (acc, current) => {
      acc.checks.push(...current.checks);
      for (const key of Object.keys(acc.summary)) acc.summary[key] += current.summary[key];
      return acc;
    },
    makeResult(),
  );
  if (json) console.log(JSON.stringify(merged, null, 2));
  else console.log(formatReport(merged));
  return merged.summary.fail > 0 ? 1 : 0;
};

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main();
}
