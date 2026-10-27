import type { HttpRequestMetricsSnapshot } from '../../../common/http/http-request-metrics.registry';

export const HTTP_REQUEST_METRICS_INTERVAL_MS = 30_000;
export const HTTP_WARN_ERROR_RATE_PERCENT = 5;
export const HTTP_WARN_P95_MS = 1_000;
export const HTTP_WARN_5XX_COUNT = 5;
export const HTTP_MIN_REQUEST_COUNT = 20;

export interface HttpRequestMetricsThresholds {
  warnErrorRatePercent: number;
  warnP95Ms: number;
  warn5xxCount: number;
  minRequestCount: number;
}

export const DEFAULT_HTTP_REQUEST_METRICS_THRESHOLDS: HttpRequestMetricsThresholds = {
  warnErrorRatePercent: HTTP_WARN_ERROR_RATE_PERCENT,
  warnP95Ms: HTTP_WARN_P95_MS,
  warn5xxCount: HTTP_WARN_5XX_COUNT,
  minRequestCount: HTTP_MIN_REQUEST_COUNT,
};

export type HttpRequestMetricsReason =
  | 'server_error_count'
  | 'server_error_rate'
  | 'p95_latency';

export interface HttpRequestMetricsEvaluation {
  level: 'log' | 'warn';
  reasons: HttpRequestMetricsReason[];
}

/** Rate/latency warnings need a minimum sample so a single failed probe does
 * not page an operator; the absolute 5xx count still catches small bursts. */
export const evaluateHttpRequestMetrics = (
  snapshot: HttpRequestMetricsSnapshot,
  thresholds: HttpRequestMetricsThresholds = DEFAULT_HTTP_REQUEST_METRICS_THRESHOLDS,
): HttpRequestMetricsEvaluation => {
  const reasons: HttpRequestMetricsReason[] = [];
  if (snapshot.interval5xx >= thresholds.warn5xxCount) {
    reasons.push('server_error_count');
  }
  if (
    snapshot.intervalRequests >= thresholds.minRequestCount &&
    snapshot.serverErrorRatePercent >= thresholds.warnErrorRatePercent
  ) {
    reasons.push('server_error_rate');
  }
  if (
    snapshot.p95DurationMs !== null &&
    snapshot.intervalRequests >= thresholds.minRequestCount &&
    snapshot.p95DurationMs > thresholds.warnP95Ms
  ) {
    reasons.push('p95_latency');
  }
  return { level: reasons.length > 0 ? 'warn' : 'log', reasons };
};
