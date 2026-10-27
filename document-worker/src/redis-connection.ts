import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import type { RedisOptions } from 'ioredis';
import type { WorkerConfig } from './config';

/**
 * Explicit TLS settings. Node's defaults already verify peers, but relying on
 * an implicit default makes a future refactor (or a stray env value) able to
 * silently disable verification. `servername` is only set for DNS hosts: an IP
 * literal is checked against the certificate's IP subjectAltName instead.
 * Keep this identical to
 * `backend/src/redis/redis.config.ts::buildRedisTlsOptions`.
 */
export const buildRedisTlsOptions = (
  config: Pick<WorkerConfig['redis'], 'tls' | 'caCertPath' | 'host'>,
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
  tls: buildRedisTlsOptions(config),
  // Identično backend/src/redis/redis.config.ts::buildBaseRedisOptions —
  // namjerno ista retry strategija/limit kao ostatak aplikacije koja se
  // povezuje na istu Redis platformu/ACL usera.
  retryStrategy: (attempts: number) => Math.min(attempts * 200, 5000),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

export const bullmqPrefix = (config: WorkerConfig['redis']): string =>
  config.keyPrefix.replace(/:$/, '');
