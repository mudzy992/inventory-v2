import type {
  RedisConnectionState,
  RedisConnectionStats,
} from '../../../redis/redis-connection.registry';

export const REDIS_METRICS_INTERVAL_MS = 30_000;
export const REDIS_PING_TIMEOUT_MS = 1_000;
export const REDIS_WARN_PING_MS = 250;
export const REDIS_WARN_DISCONNECT_SECONDS = 60;
export const REDIS_WARN_RECONNECT_COUNT = 3;

export type RedisMetricsReason =
  | 'registry_unavailable'
  | 'not_ready'
  | 'ping_error'
  | 'slow_ping'
  | 'disconnected_too_long'
  | 'reconnects';

export interface RedisMetricsThresholds {
  warnPingMs: number;
  warnDisconnectSeconds: number;
  warnReconnectCount: number;
}

export interface RedisMetricsSnapshot extends RedisMetricsThresholds {
  observedAt: string;
  state: RedisConnectionState;
  clientStatus: string;
  ready: boolean;
  pingOk: boolean;
  pingMs: number | null;
  pingTimeoutMs: number;
  reconnectCount: number;
  errorCount: number;
  lastReadyAt: string | null;
  lastDisconnectAt: string | null;
  lastErrorAt: string | null;
  secondsSinceLastReady: number | null;
  registryUnavailable: boolean;
}

export interface RedisMetricsEvaluation {
  level: 'log' | 'warn';
  reasons: RedisMetricsReason[];
}

export const withTimeout = <T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });

const ageSecondsFrom = (timestamp: string | null, now: Date): number | null => {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((now.getTime() - parsed) / 1000));
};

export const buildRedisMetricsSnapshot = (
  stats: RedisConnectionStats | null,
  pingMs: number | null,
  pingOk: boolean,
  thresholds: RedisMetricsThresholds,
  now: Date = new Date(),
): RedisMetricsSnapshot => {
  const lastReference = stats?.lastReadyAt ?? stats?.lastDisconnectAt ?? null;
  return {
    observedAt: now.toISOString(),
    state: stats?.state ?? 'unknown',
    clientStatus: stats?.clientStatus ?? 'unknown',
    ready: stats?.ready ?? false,
    pingOk,
    pingMs,
    pingTimeoutMs: REDIS_PING_TIMEOUT_MS,
    reconnectCount: stats?.reconnectCount ?? 0,
    errorCount: stats?.errorCount ?? 0,
    lastReadyAt: stats?.lastReadyAt ?? null,
    lastDisconnectAt: stats?.lastDisconnectAt ?? null,
    lastErrorAt: stats?.lastErrorAt ?? null,
    secondsSinceLastReady: ageSecondsFrom(lastReference, now),
    registryUnavailable: stats === null,
    ...thresholds,
  };
};

export const evaluateRedisMetrics = (
  snapshot: RedisMetricsSnapshot,
): RedisMetricsEvaluation => {
  const reasons: RedisMetricsReason[] = [];
  if (snapshot.registryUnavailable) {
    reasons.push('registry_unavailable');
  }
  if (!snapshot.ready) {
    reasons.push('not_ready');
  }
  if (!snapshot.pingOk) {
    reasons.push('ping_error');
  }
  if (snapshot.pingMs !== null && snapshot.pingMs >= snapshot.warnPingMs) {
    reasons.push('slow_ping');
  }
  if (
    !snapshot.ready &&
    snapshot.secondsSinceLastReady !== null &&
    snapshot.secondsSinceLastReady >= snapshot.warnDisconnectSeconds
  ) {
    reasons.push('disconnected_too_long');
  }
  if (snapshot.reconnectCount >= snapshot.warnReconnectCount) {
    reasons.push('reconnects');
  }
  return { level: reasons.length > 0 ? 'warn' : 'log', reasons };
};
