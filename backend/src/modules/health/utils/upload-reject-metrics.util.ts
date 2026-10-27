import type { UploadRejectSnapshot } from '../../../common/upload/upload-reject.registry';

export const UPLOAD_REJECT_METRICS_INTERVAL_MS = 30_000;
export const UPLOAD_WARN_REJECT_COUNT = 10;

export type UploadRejectMetricsReason = 'interval_rejects';

export interface UploadRejectMetricsEvaluation {
  level: 'log' | 'warn';
  reasons: UploadRejectMetricsReason[];
}

export const evaluateUploadRejectMetrics = (
  snapshot: UploadRejectSnapshot,
  warnRejectCount: number,
): UploadRejectMetricsEvaluation => {
  const reasons: UploadRejectMetricsReason[] = [];
  if (snapshot.intervalRejects >= warnRejectCount) {
    reasons.push('interval_rejects');
  }
  return { level: reasons.length > 0 ? 'warn' : 'log', reasons };
};
