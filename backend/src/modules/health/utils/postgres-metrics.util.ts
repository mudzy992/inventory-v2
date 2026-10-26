import type { PostgresPoolStats } from '../../../prisma/postgres-pool.registry';

export const POSTGRES_METRICS_INTERVAL_MS = 30_000;
export const POSTGRES_WARN_LATENCY_MS = 250;
export const POSTGRES_WARN_WAITING_COUNT = 1;
export const POSTGRES_WARN_UTILIZATION_PERCENT = 90;

export type PostgresDatabaseState = 'connected' | 'error';
export type PostgresMetricsReason =
  | 'pool_unavailable'
  | 'db_error'
  | 'latency'
  | 'pool_waiting'
  | 'utilization';

export interface PostgresMetricsThresholds {
  warnLatencyMs: number;
  warnWaitingCount: number;
  warnUtilizationPercent: number;
}

export interface PostgresMetricsSnapshot extends PostgresMetricsThresholds {
  observedAt: string;
  dbState: PostgresDatabaseState;
  latencyMs: number | null;
  poolMax: number;
  poolTotal: number;
  poolIdle: number;
  poolWaiting: number;
  poolUtilizationPercent: number;
  poolUnavailable: boolean;
}

export interface PostgresMetricsEvaluation {
  level: 'log' | 'warn';
  reasons: PostgresMetricsReason[];
}

export const postgresPoolUtilizationPercent = (
  totalConnections: number,
  maxConnections: number,
): number => {
  if (maxConnections <= 0 || totalConnections <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((totalConnections / maxConnections) * 100));
};

export const buildPostgresMetricsSnapshot = (
  poolStats: PostgresPoolStats | null,
  latencyMs: number | null,
  dbState: PostgresDatabaseState,
  thresholds: PostgresMetricsThresholds,
  observedAt: Date = new Date(),
): PostgresMetricsSnapshot => {
  const poolMax = poolStats?.max ?? 0;
  const poolTotal = poolStats?.total ?? 0;
  return {
    observedAt: observedAt.toISOString(),
    dbState,
    latencyMs,
    poolMax,
    poolTotal,
    poolIdle: poolStats?.idle ?? 0,
    poolWaiting: poolStats?.waiting ?? 0,
    poolUtilizationPercent: postgresPoolUtilizationPercent(poolTotal, poolMax),
    poolUnavailable: poolStats === null,
    ...thresholds,
  };
};

export const evaluatePostgresMetrics = (
  snapshot: PostgresMetricsSnapshot,
): PostgresMetricsEvaluation => {
  const reasons: PostgresMetricsReason[] = [];
  if (snapshot.poolUnavailable) {
    reasons.push('pool_unavailable');
  }
  if (snapshot.dbState === 'error') {
    reasons.push('db_error');
  }
  if (snapshot.latencyMs !== null && snapshot.latencyMs >= snapshot.warnLatencyMs) {
    reasons.push('latency');
  }
  if (snapshot.poolWaiting >= snapshot.warnWaitingCount) {
    reasons.push('pool_waiting');
  }
  if (
    snapshot.poolUtilizationPercent >= snapshot.warnUtilizationPercent &&
    snapshot.poolMax > 0
  ) {
    reasons.push('utilization');
  }
  return { level: reasons.length > 0 ? 'warn' : 'log', reasons };
};
