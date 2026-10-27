import type { BusinessTransitionMetricsSnapshot } from '../../../common/metrics/business-transition-metrics.registry';

export const BUSINESS_TRANSITION_METRICS_INTERVAL_MS = 30_000;
export const BUSINESS_WARN_REJECTED_COUNT = 20;
export const BUSINESS_WARN_REJECTED_RATE_PERCENT = 10;
export const BUSINESS_WARN_FAILED_TERMINAL_COUNT = 10;
export const BUSINESS_MIN_TRANSITION_COUNT = 20;

export interface BusinessTransitionMetricsThresholds {
  warnRejectedCount: number;
  warnRejectedRatePercent: number;
  warnFailedTerminalCount: number;
  minTransitionCount: number;
}

export const DEFAULT_BUSINESS_TRANSITION_METRICS_THRESHOLDS: BusinessTransitionMetricsThresholds = {
  warnRejectedCount: BUSINESS_WARN_REJECTED_COUNT,
  warnRejectedRatePercent: BUSINESS_WARN_REJECTED_RATE_PERCENT,
  warnFailedTerminalCount: BUSINESS_WARN_FAILED_TERMINAL_COUNT,
  minTransitionCount: BUSINESS_MIN_TRANSITION_COUNT,
};

export type BusinessTransitionMetricsReason =
  | 'terminal_failures'
  | 'rejected_burst'
  | 'rejected_rate';

export interface BusinessTransitionMetricsEvaluation {
  level: 'log' | 'warn';
  reasons: BusinessTransitionMetricsReason[];
}

/** Rejections are stale/duplicate compare-and-set attempts: a burst indicates
 * a race, a double submit or a retry storm. Terminal `failed` transitions
 * count business outcomes that never completed successfully. */
export const evaluateBusinessTransitionMetrics = (
  snapshot: BusinessTransitionMetricsSnapshot,
  thresholds: BusinessTransitionMetricsThresholds = DEFAULT_BUSINESS_TRANSITION_METRICS_THRESHOLDS,
): BusinessTransitionMetricsEvaluation => {
  const reasons: BusinessTransitionMetricsReason[] = [];
  if (snapshot.terminalFailed >= thresholds.warnFailedTerminalCount) {
    reasons.push('terminal_failures');
  }
  if (snapshot.rejected >= thresholds.warnRejectedCount) {
    reasons.push('rejected_burst');
  }
  if (
    snapshot.intervalTransitions >= thresholds.minTransitionCount &&
    snapshot.rejectedRatePercent >= thresholds.warnRejectedRatePercent
  ) {
    reasons.push('rejected_rate');
  }
  return { level: reasons.length > 0 ? 'warn' : 'log', reasons };
};
