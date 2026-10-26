export const QUEUE_METRICS_INTERVAL_MS = 30_000;
export const QUEUE_METRICS_WARN_BACKLOG_COUNT = 50;
export const QUEUE_METRICS_WARN_WAITING_SECONDS = 300;
export const QUEUE_METRICS_WARN_ACTIVE_SECONDS = 1_800;

export interface QueueMetricsThresholds {
  backlogWarnThreshold: number;
  waitingWarnThresholdSeconds: number;
  activeWarnThresholdSeconds: number;
}

export interface QueueMetricsSnapshot extends QueueMetricsThresholds {
  queue: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  backlog: number;
  oldestWaitingAgeSeconds: number;
  oldestActiveAgeSeconds: number;
}

export interface QueueMetricsEvaluation {
  level: 'log' | 'warn';
  reasons: Array<'backlog' | 'waiting_age' | 'active_age'>;
}

export const ageSecondsFromTimestamp = (
  timestamp: number | null | undefined,
  now: Date,
): number => {
  if (!timestamp || !Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 1_000));
};

export const evaluateQueueMetrics = (
  metrics: QueueMetricsSnapshot,
): QueueMetricsEvaluation => {
  const reasons: QueueMetricsEvaluation['reasons'] = [];
  if (metrics.backlog >= metrics.backlogWarnThreshold) {
    reasons.push('backlog');
  }
  if (metrics.oldestWaitingAgeSeconds >= metrics.waitingWarnThresholdSeconds) {
    reasons.push('waiting_age');
  }
  if (metrics.oldestActiveAgeSeconds >= metrics.activeWarnThresholdSeconds) {
    reasons.push('active_age');
  }
  return { level: reasons.length > 0 ? 'warn' : 'log', reasons };
};
