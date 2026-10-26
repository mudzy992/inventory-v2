import { writeStructuredLog, type StructuredLogLevel } from '../common/logging/structured-log.util';
import { redactSensitiveText } from '../common/utils/redact-log.util';
import type Redis from 'ioredis';

export type RedisConnectionEvent =
  | 'connect'
  | 'ready'
  | 'reconnecting'
  | 'error'
  | 'close'
  | 'end';

export type RedisConnectionState =
  | 'connecting'
  | 'connected'
  | 'ready'
  | 'reconnecting'
  | 'closed'
  | 'ended'
  | 'unknown';

export interface RedisConnectionStats {
  state: RedisConnectionState;
  clientStatus: string;
  ready: boolean;
  lastEvent: RedisConnectionEvent | null;
  lastEventAt: string | null;
  lastReadyAt: string | null;
  lastDisconnectAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  connectCount: number;
  readyCount: number;
  reconnectCount: number;
  errorCount: number;
  closeCount: number;
  endCount: number;
}

export interface RedisConnectionEventDetail {
  message?: string;
  retryDelayMs?: number;
}

const initialStats = (): RedisConnectionStats => ({
  state: 'unknown',
  clientStatus: 'unknown',
  ready: false,
  lastEvent: null,
  lastEventAt: null,
  lastReadyAt: null,
  lastDisconnectAt: null,
  lastErrorAt: null,
  lastErrorMessage: null,
  connectCount: 0,
  readyCount: 0,
  reconnectCount: 0,
  errorCount: 0,
  closeCount: 0,
  endCount: 0,
});

let activeRedisClient: Redis | null = null;
let connectionStats = initialStats();

const mapClientStatus = (client: Redis | null): {
  state: RedisConnectionState;
  clientStatus: string;
  ready: boolean;
} => {
  const status = (() => {
    try {
      return client?.status ?? 'unknown';
    } catch {
      return 'unknown';
    }
  })();
  switch (status) {
    case 'ready':
      return { state: 'ready', clientStatus: status, ready: true };
    case 'connect':
      return { state: 'connected', clientStatus: status, ready: false };
    case 'connecting':
    case 'wait':
      return { state: 'connecting', clientStatus: status, ready: false };
    case 'reconnecting':
      return { state: 'reconnecting', clientStatus: status, ready: false };
    case 'close':
      return { state: 'closed', clientStatus: status, ready: false };
    case 'end':
      return { state: 'ended', clientStatus: status, ready: false };
    default:
      return { state: 'unknown', clientStatus: status, ready: false };
  }
};

const currentStats = (): RedisConnectionStats => ({
  ...connectionStats,
  ...mapClientStatus(activeRedisClient),
});

const readActiveRedisConnectionStats = (): RedisConnectionStats | null =>
  activeRedisClient ? currentStats() : null;

export const recordRedisConnectionEvent = (
  event: RedisConnectionEvent,
  detail: RedisConnectionEventDetail = {},
  at: Date = new Date(),
): RedisConnectionStats => {
  const timestamp = at.toISOString();
  const next: RedisConnectionStats = {
    ...connectionStats,
    lastEvent: event,
    lastEventAt: timestamp,
  };
  switch (event) {
    case 'connect':
      next.connectCount += 1;
      break;
    case 'ready':
      next.readyCount += 1;
      next.lastReadyAt = timestamp;
      break;
    case 'reconnecting':
      next.reconnectCount += 1;
      next.lastDisconnectAt = timestamp;
      break;
    case 'error':
      next.errorCount += 1;
      next.lastErrorAt = timestamp;
      next.lastErrorMessage = detail.message
        ? redactSensitiveText(detail.message)
        : null;
      break;
    case 'close':
      next.closeCount += 1;
      next.lastDisconnectAt = timestamp;
      break;
    case 'end':
      next.endCount += 1;
      next.lastDisconnectAt = timestamp;
      break;
  }
  connectionStats = next;
  return currentStats();
};

export const redisConnectionRegistry = {
  getStats: readActiveRedisConnectionStats,
  recordEvent: recordRedisConnectionEvent,
};

export const setActiveRedisClient = (client: Redis | null): void => {
  activeRedisClient = client;
  connectionStats = initialStats();
};

export const clearActiveRedisClient = (): void => {
  setActiveRedisClient(null);
};

const eventLogLevel: Record<RedisConnectionEvent, StructuredLogLevel> = {
  connect: 'log',
  ready: 'log',
  reconnecting: 'warn',
  error: 'error',
  close: 'warn',
  end: 'warn',
};

const eventLogName: Record<RedisConnectionEvent, string> = {
  connect: 'redis_client_connect',
  ready: 'redis_client_ready',
  reconnecting: 'redis_client_reconnecting',
  error: 'redis_client_error',
  close: 'redis_client_close',
  end: 'redis_client_end',
};

/** Attach process-lifetime observers to the shared ioredis client. The
 * registry keeps reconnect/error counters even when no metrics interval is
 * currently running; lifecycle logs are structured and free of credentials. */
export const attachRedisConnectionObservers = (
  client: Redis,
  options: { emitLogs?: boolean } = {},
): (() => void) => {
  const emitLogs = options.emitLogs ?? true;
  setActiveRedisClient(client);

  const handle = (
    event: RedisConnectionEvent,
    detail: RedisConnectionEventDetail = {},
  ): void => {
    const at = new Date();
    const stats = recordRedisConnectionEvent(event, detail, at);
    if (!emitLogs) return;
    writeStructuredLog(eventLogLevel[event], {
      event: eventLogName[event],
      observedAt: at.toISOString(),
      state: stats.state,
      clientStatus: stats.clientStatus,
      ready: stats.ready,
      reconnectCount: stats.reconnectCount,
      errorCount: stats.errorCount,
      ...(detail.retryDelayMs !== undefined
        ? { retryDelayMs: detail.retryDelayMs }
        : {}),
      ...(detail.message !== undefined
        ? { message: redactSensitiveText(detail.message) }
        : {}),
    });
  };

  const onConnect = (): void => handle('connect');
  const onReady = (): void => handle('ready');
  const onReconnecting = (delay: unknown): void =>
    handle('reconnecting', {
      retryDelayMs: typeof delay === 'number' && Number.isFinite(delay) ? delay : undefined,
    });
  const onError = (error: unknown): void =>
    handle('error', { message: error instanceof Error ? error.message : String(error) });
  const onClose = (): void => handle('close');
  const onEnd = (): void => handle('end');

  client.on('connect', onConnect);
  client.on('ready', onReady);
  client.on('reconnecting', onReconnecting);
  client.on('error', onError);
  client.on('close', onClose);
  client.on('end', onEnd);

  return () => {
    client.off('connect', onConnect);
    client.off('ready', onReady);
    client.off('reconnecting', onReconnecting);
    client.off('error', onError);
    client.off('close', onClose);
    client.off('end', onEnd);
    if (activeRedisClient === client) {
      clearActiveRedisClient();
    }
  };
};

export { readActiveRedisConnectionStats };
