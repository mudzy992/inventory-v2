import { readFileSync } from 'node:fs';
import type { RedisOptions } from 'ioredis';
import type { WorkerConfig } from './config';

/**
 * BullMQ (Worker/QueueEvents) NE koristi ioredis `keyPrefix` opciju — kao i
 * u backend/src/queues/bullmq.module.ts, prefiksiranje ključeva ide preko
 * BullMQ-native `prefix` opcije (vidi worker.ts), ova funkcija vraća samo
 * bazne (bez keyPrefix-a) konekcione opcije.
 */
export const buildRedisOptions = (config: WorkerConfig['redis']): RedisOptions => ({
  host: config.host,
  port: config.port,
  username: config.username,
  password: config.password,
  db: config.db,
  // Preserve Node's normal certificate and hostname verification. When a
  // private CA is supplied, use it as the trust anchor for this TLS socket.
  tls: config.tls
    ? config.caCertPath
      ? { ca: readFileSync(config.caCertPath) }
      : {}
    : undefined,
  // Identično backend/src/redis/redis.config.ts::buildBaseRedisOptions —
  // namjerno ista retry strategija/limit kao ostatak aplikacije koja se
  // povezuje na istu Redis platformu/ACL usera.
  retryStrategy: (attempts: number) => Math.min(attempts * 200, 5000),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

export const bullmqPrefix = (config: WorkerConfig['redis']): string =>
  config.keyPrefix.replace(/:$/, '');
