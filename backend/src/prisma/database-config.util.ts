import { readFileSync } from 'node:fs';

export type DatabaseSslMode = 'disable' | 'require' | 'verify-ca' | 'verify-full';

export interface DatabaseSslConfig {
  rejectUnauthorized: true;
  ca?: string;
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

const resolveSslConfig = (
  parsedUrl: URL | null,
  env: NodeJS.ProcessEnv,
): DatabaseSslConfig | undefined => {
  const urlMode = parsedUrl?.searchParams.get('sslmode');
  const configuredMode = urlMode ?? env.DATABASE_SSL_MODE ?? 'disable';
  if (!SUPPORTED_SSL_MODES.has(configuredMode as DatabaseSslMode)) {
    throw new Error(
      `Unsupported PostgreSQL sslmode "${configuredMode}". Use disable, require, verify-ca, or verify-full.`,
    );
  }

  const caPath = parsedUrl?.searchParams.get('sslrootcert') ?? env.DATABASE_SSL_CA;
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
  return {
    rejectUnauthorized: true,
    ...(ca ? { ca } : {}),
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
    ssl: resolveSslConfig(parsed, env),
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
    ssl: resolveSslConfig(null, env),
  };
};
