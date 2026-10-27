import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import type { RedisOptions } from 'ioredis';

/**
 * Centralna definicija Redis konekcionih parametara. Aplikacija se povezuje
 * na centralnu Redis platformu (redis_net, ACL user ograničen na
 * `${REDIS_KEY_PREFIX}:*` key/pubsub namespace — vidi Redis platform repo,
 * acl/users.acl).
 *
 * REDIS_KEY_PREFIX se koristi na dva različita mjesta iz dva različita
 * razloga:
 *  - opšti cache/lock klijent (RedisService) koristi ga kao ioredis
 *    `keyPrefix` opciju — automatski prefiksuje SVAKI ključ i pubsub kanal.
 *  - BullMQ NE koristi ioredis `keyPrefix` (nije zvanično podržana kombinacija
 *    za Lua skripte koje BullMQ koristi iznutra) — umjesto toga, dobija
 *    posebnu konekciju bez keyPrefix-a i koristi svoju vlastitu `prefix`
 *    opciju (vidi queues/bullmq.module.ts).
 */
export interface RedisAppConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  keyPrefix: string;
  tls: boolean;
  caCertPath?: string;
}

const readInteger = (
  name: string,
  fallback: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const normalized = raw.trim();
  if (!/^\d+$/u.test(normalized)) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
};

const readBoolean = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const normalized = raw.trim();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`${name} must be either "true" or "false"`);
};

export const readRedisConfig = (): RedisAppConfig => {
  const keyPrefix = (process.env.REDIS_KEY_PREFIX ?? 'inventory-v2').replace(/:+$/, '');
  return {
    host: process.env.REDIS_HOST ?? 'redis-core',
    port: readInteger('REDIS_PORT', 6379, 1, 65535),
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    db: readInteger('REDIS_DB', 0, 0),
    keyPrefix: `${keyPrefix}:`,
    tls: readBoolean('REDIS_TLS', false),
    caCertPath: process.env.REDIS_CA_CERT_PATH?.trim() || undefined,
  };
};

/**
 * Explicit TLS settings for every Redis consumer. Node's defaults already
 * verify peers, but relying on an implicit default makes a future refactor
 * (or a stray env value) able to silently disable verification. `servername`
 * is only set for DNS hosts: an IP literal is checked against the certificate's
 * IP subjectAltName instead. Keep this identical to
 * `document-worker/src/redis-connection.ts::buildRedisTlsOptions`.
 */
export const buildRedisTlsOptions = (
  config: Pick<RedisAppConfig, 'tls' | 'caCertPath' | 'host'>,
): RedisOptions['tls'] => {
  if (!config.tls) return undefined;
  return {
    ...(config.caCertPath ? { ca: readFileSync(config.caCertPath) } : {}),
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
    ...(isIP(config.host) === 0 ? { servername: config.host } : {}),
  };
};

/**
 * Bazne (bez keyPrefix-a) ioredis opcije — koriste ih BullMQ i Socket.IO.
 * TLS koristi sistemski trust store ili montirani CA, uz eksplicitnu provjeru
 * certifikata i hostname-a. Retry strategija ostaje brza i ograničena.
 */
export const buildBaseRedisOptions = (config: RedisAppConfig): RedisOptions => ({
  host: config.host,
  port: config.port,
  username: config.username,
  password: config.password,
  db: config.db,
  tls: buildRedisTlsOptions(config),
  retryStrategy: (attempts: number) => Math.min(attempts * 200, 5000),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

/**
 * BullMQ REQUIRES `maxRetriesPerRequest: null` on every Queue / Worker /
 * QueueEvents connection: its blocking commands (`BRPOP`, `XREAD BLOCK`, …)
 * must be allowed to wait indefinitely instead of being retried and rejected
 * by ioredis. Passing `3` produced the runtime warning
 * "Your redis options maxRetriesPerRequest must be null and will be
 * overridden by BullMQ." — BullMQ silently overrode it anyway, so every
 * BullMQ consumer must use this builder, NOT buildBaseRedisOptions().
 * The general cache/lock client and the Socket.IO adapter keep the bounded
 * value above, where a fast, explicit failure is the desired behaviour.
 */
export const buildBullMqRedisOptions = (config: RedisAppConfig): RedisOptions => ({
  ...buildBaseRedisOptions(config),
  maxRetriesPerRequest: null,
});
