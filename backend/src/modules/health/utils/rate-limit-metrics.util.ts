import type { RateLimitMetricsSnapshot } from '../../../redis/rate-limit-metrics.registry';

export const RATE_LIMIT_METRICS_INTERVAL_MS = 30_000;
export const RATE_LIMIT_WARN_FAIL_OPEN_COUNT = 5;
export const RATE_LIMIT_WARN_CONSECUTIVE_FAILURES = 3;
export const RATE_LIMIT_WARN_EXCEEDED_COUNT = 25;

export interface RateLimitMetricsThresholds {
  warnFailOpenCount: number;
  warnConsecutiveFailures: number;
  warnExceededCount: number;
}

export const DEFAULT_RATE_LIMIT_METRICS_THRESHOLDS: RateLimitMetricsThresholds = {
  warnFailOpenCount: RATE_LIMIT_WARN_FAIL_OPEN_COUNT,
  warnConsecutiveFailures: RATE_LIMIT_WARN_CONSECUTIVE_FAILURES,
  warnExceededCount: RATE_LIMIT_WARN_EXCEEDED_COUNT,
};

export type RateLimitMetricsReason =
  | 'fail_closed'
  | 'sustained_outage'
  | 'fail_open_burst'
  | 'exceeded_burst';

export interface RateLimitMetricsEvaluation {
  level: 'log' | 'warn';
  reasons: RateLimitMetricsReason[];
}

/** `fail_closed` is always significant because legitimate requests were
 * rejected; the other reasons are threshold-driven. A sustained Redis outage
 * warns even between reporting intervals because the streak is process state. */
export const evaluateRateLimitMetrics = (
  snapshot: RateLimitMetricsSnapshot,
  thresholds: RateLimitMetricsThresholds = DEFAULT_RATE_LIMIT_METRICS_THRESHOLDS,
): RateLimitMetricsEvaluation => {
  const reasons: RateLimitMetricsReason[] = [];
  if (snapshot.intervalFailClosed > 0) {
    reasons.push('fail_closed');
  }
  if (snapshot.consecutiveFailures >= thresholds.warnConsecutiveFailures) {
    reasons.push('sustained_outage');
  }
  if (snapshot.intervalFailOpen >= thresholds.warnFailOpenCount) {
    reasons.push('fail_open_burst');
  }
  if (snapshot.intervalExceeded >= thresholds.warnExceededCount) {
    reasons.push('exceeded_burst');
  }
  return { level: reasons.length > 0 ? 'warn' : 'log', reasons };
};
