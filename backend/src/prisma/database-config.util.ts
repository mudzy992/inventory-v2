import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';

export type DatabaseSslMode = 'disable' | 'require' | 'verify-ca' | 'verify-full';

export interface DatabaseSslConfig {
  rejectUnauthorized: true;
  minVersion: 'TLSv1.2';
  ca?: string;
  servername?: string;
}

export interface DatabaseConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: DatabaseSslConfig;
}

const SUPPORTED_SSL_MODES = new Set<DatabaseSslMode>([
  'disable',
  'require',
  'verify-ca',
  'verify-full',
]);

export const DEFAULT_DATABASE_POOL_MAX = 10;
export const MAX_DATABASE_POOL_MAX = 100;

/** Pool size is deployment configuration: replicas × DATABASE_POOL_MAX, plus
 * document-worker, migration and maintenance connections, must stay below the
 * PostgreSQL max_connections reserve. Keep the validated range deliberately
 * narrow so a typo cannot exhaust the database for every replica. */
export const resolveDatabasePoolMax = (
  env: NodeJS.ProcessEnv = process.env,
): number => {
  const raw = env.DATABASE_POOL_MAX;
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_DATABASE_POOL_MAX;
  }
  if (!/^\d+$/u.test(raw.trim())) {
    throw new Error(
      `DATABASE_POOL_MAX must be an integer between 1 and ${MAX_DATABASE_POOL_MAX}`,
    );
  }
  const parsed = Number(raw.trim());
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > MAX_DATABASE_POOL_MAX
  ) {
    throw new Error(
      `DATABASE_POOL_MAX must be an integer between 1 and ${MAX_DATABASE_POOL_MAX}`,
    );
  }
  return parsed;
};

const resolveSslConfig = (
  parsedUrl: URL | null,
  env: NodeJS.ProcessEnv,
  host: string,
): DatabaseSslConfig | undefined => {
  const urlMode = parsedUrl?.searchParams.get('sslmode');
  const envMode = env.DATABASE_SSL_MODE;
  // A `sslmode=disable` embedded in DATABASE_URL must never silently override
  // an explicit deployment-wide verified TLS policy (nor the reverse). Two
  // different *enabled* modes are harmless: this driver treats every enabled
  // mode as verified TLS, so the deployment-wide env value simply wins.
  if (urlMode && envMode && urlMode !== envMode) {
    const urlEnabled = SUPPORTED_SSL_MODES.has(urlMode as DatabaseSslMode) && urlMode !== 'disable';
    const envEnabled = SUPPORTED_SSL_MODES.has(envMode as DatabaseSslMode) && envMode !== 'disable';
    if (urlEnabled !== envEnabled) {
      throw new Error(
        'Conflicting PostgreSQL sslmode: DATABASE_URL sslmode and DATABASE_SSL_MODE disagree about TLS',
      );
    }
  }
  const configuredMode = envMode ?? urlMode ?? 'disable';
  if (!SUPPORTED_SSL_MODES.has(configuredMode as DatabaseSslMode)) {
    throw new Error(
      `Unsupported PostgreSQL sslmode "${configuredMode}". Use disable, require, verify-ca, or verify-full.`,
    );
  }

  const urlCa = parsedUrl?.searchParams.get('sslrootcert');
  const caPath = (urlCa && urlCa.trim() !== '' ? urlCa : null) ?? env.DATABASE_SSL_CA;
  if (configuredMode === 'disable') {
    if (caPath) {
      throw new Error('DATABASE_SSL_CA/sslrootcert requires PostgreSQL TLS to be enabled');
    }
    return undefined;
  }

  const ca = caPath ? readFileSync(caPath, 'utf8') : undefined;
  // Node's TLS client verifies the certificate chain and hostname. Even
  // sslmode=require is intentionally treated as verified TLS, not encryption
  // without peer authentication; supply DATABASE_SSL_CA for a private CA.
  // `minVersion` and `servername` are explicit so a future refactor cannot
  // fall back to an implicit (or IP-invalid) verification default.
  return {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
    ...(ca ? { ca } : {}),
    ...(isIP(host) === 0 ? { servername: host } : {}),
  };
};

const parseDatabaseUrl = (
  databaseUrl: string,
  env: NodeJS.ProcessEnv,
): DatabaseConnectionConfig => {
  const parsed = new URL(databaseUrl);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!database) {
    throw new Error('DATABASE_URL must include a database name');
  }

  const port = parsed.port ? Number(parsed.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DATABASE_URL must include a valid port');
  }

  return {
    host: parsed.hostname,
    port,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
    ssl: resolveSslConfig(parsed, env, parsed.hostname),
  };
};

export const resolveDatabaseConfig = (
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConnectionConfig => {
  const databaseUrl = env.DATABASE_URL;
  if (databaseUrl) {
    return parseDatabaseUrl(databaseUrl, env);
  }

  const host = env.DATABASE_HOST;
  const user = env.DATABASE_USER;
  const password = env.DATABASE_PASSWORD;
  const database = env.DATABASE_NAME;
  if (!host || !user || password === undefined || !database) {
    throw new Error('Set DATABASE_URL or DATABASE_HOST/USER/PASSWORD/NAME');
  }

  const port = Number(env.DATABASE_PORT ?? 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DATABASE_PORT must be an integer between 1 and 65535');
  }

  return {
    host,
    port,
    user,
    password,
    database,
    ssl: resolveSslConfig(null, env, host),
  };
};
