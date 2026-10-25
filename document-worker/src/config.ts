/**
 * Env varijable namjerno IMENOVANE ISTO kao u backend/src/redis/redis.config.ts
 * (REDIS_HOST, REDIS_PORT, REDIS_USERNAME, REDIS_PASSWORD, REDIS_DB,
 * REDIS_KEY_PREFIX, REDIS_TLS, REDIS_CA_CERT_PATH) — worker se povezuje na ISTU
 * Redis platformu ISTIM ACL userom (inventory-v2), u ISTOM `${REDIS_KEY_PREFIX}:*` namespace-u
 * kao i backend. Nema potrebe za novim ACL userom niti proširenjem ACL
 * dozvola — worker je, sa stanovišta Redisa, samo dodatni BullMQ konzument
 * u istom namespace-u (koncepcijski ekvivalentno horizontalnom skaliranju
 * postojećih in-process worker-a, samo u zasebnom kontejneru).
 */
export interface WorkerConfig {
  redis: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    db: number;
    keyPrefix: string;
    tls: boolean;
    caCertPath?: string;
  };
  queueName: string;
  uploadDir: string;
  tmpDir: string;
  concurrency: number;
  convertTimeoutMs: number;
  healthPort: number;
  sofficeBinary: string;
}

const readInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const normalized = raw.trim();
  if (!/^\d+$/u.test(normalized)) return fallback;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const loadConfig = (): WorkerConfig => {
  const keyPrefix = (process.env.REDIS_KEY_PREFIX ?? 'inventory-v2').replace(/:+$/, '');
  return {
    redis: {
      host: process.env.REDIS_HOST ?? 'redis-core',
      port: readInt('REDIS_PORT', 6379),
      username: process.env.REDIS_USERNAME || undefined,
      password: process.env.REDIS_PASSWORD || undefined,
      db: readInt('REDIS_DB', 0),
      keyPrefix: `${keyPrefix}:`,
      tls: process.env.REDIS_TLS === 'true',
      caCertPath: process.env.REDIS_CA_CERT_PATH?.trim() || undefined,
    },
    // Mora biti identično DOCUMENT_GENERATION_QUEUE u
    // backend/src/modules/documents/document-generation.queue.ts.
    queueName: process.env.DOCUMENT_QUEUE_NAME ?? 'document-generation',
    uploadDir: process.env.UPLOAD_DIR ?? '/app/uploads',
    tmpDir: process.env.DOCUMENT_WORKER_TMP_DIR ?? '/tmp/document-worker',
    concurrency: readInt('DOCUMENT_WORKER_CONCURRENCY', 2),
    convertTimeoutMs: readInt('DOCUMENT_WORKER_CONVERT_TIMEOUT_MS', 120_000),
    healthPort: readInt('DOCUMENT_WORKER_HEALTH_PORT', 8080),
    sofficeBinary: process.env.DOCUMENT_WORKER_SOFFICE_BIN ?? 'soffice',
  };
};
