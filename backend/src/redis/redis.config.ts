import { readFileSync } from 'node:fs';
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

export const readRedisConfig = (): RedisAppConfig => {
  const keyPrefix = (process.env.REDIS_KEY_PREFIX ?? 'inventory-v2').replace(/:+$/, '');
  return {
    host: process.env.REDIS_HOST ?? 'redis-core',
    port: Number(process.env.REDIS_PORT ?? 6379),
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB ?? 0),
    keyPrefix: `${keyPrefix}:`,
    tls: process.env.REDIS_TLS === 'true',
    caCertPath: process.env.REDIS_CA_CERT_PATH?.trim() || undefined,
  };
};

/** Baznе (bez keyPrefix-a) ioredis opcije — koristi ih svako ko pravi
 * vlastitu konekciju (BullMQ, Socket.IO adapter) i sam odlučuje o namespace
 * strategiji. */
export const buildBaseRedisOptions = (config: RedisAppConfig): RedisOptions => ({
  host: config.host,
  port: config.port,
  username: config.username,
  password: config.password,
  db: config.db,
  // Do not disable certificate/hostname verification. When a private CA is
  // configured, pass it as a trust anchor; otherwise Node's system trust store
  // is used. This is shared by plain ioredis, BullMQ and Socket.IO clients.
  tls: config.tls
    ? config.caCertPath
      ? { ca: readFileSync(config.caCertPath) }
      : {}
    : undefined,
  // Robusna retry strategija — bitno jer ova aplikacija ima kritične puteve
  // (login rate-limit, BullMQ, Socket.IO) koji zavise od Redis-a; brz
  // ali ograničen retry umjesto default ponašanja koje odustaje.
  retryStrategy: (attempts: number) => Math.min(attempts * 200, 5000),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});
