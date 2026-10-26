import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export const CORRELATION_ID_HEADER = 'x-request-id';
export const CORRELATION_ID_RESPONSE_HEADER = 'X-Request-Id';
export const CORRELATION_ID_ALIAS_HEADER = 'x-correlation-id';

const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/u;

const storage = new AsyncLocalStorage<string>();

/** Accept only a conservative subset of incoming IDs: the header is echoed
 * back and included in logs, so it must not be able to inject control chars. */
export const normalizeCorrelationId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return SAFE_CORRELATION_ID.test(trimmed) ? trimmed : null;
};

export const getCorrelationId = (): string | undefined => storage.getStore();

export const runWithCorrelationId = <T>(correlationId: string, callback: () => T): T =>
  storage.run(correlationId, callback);

/** HTTP handlers reuse the request ID; schedulers/workers get a fresh one so
 * their logs and BullMQ payloads remain traceable. */
export const ensureCorrelationId = (): string => getCorrelationId() ?? randomUUID();
