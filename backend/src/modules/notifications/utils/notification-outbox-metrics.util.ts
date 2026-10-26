export const NOTIFICATION_OUTBOX_METRICS_INTERVAL_MS = 30_000;
export const NOTIFICATION_OUTBOX_WARN_BACKLOG_COUNT = 50;
export const NOTIFICATION_OUTBOX_WARN_AGE_SECONDS = 300;

export interface NotificationOutboxMetrics {
  pending: number;
  running: number;
  backlog: number;
  oldestUndeliveredAgeSeconds: number;
  oldestStatus: 'pending' | 'running' | null;
  oldestAttempts: number | null;
  backlogWarnThreshold: number;
  ageWarnThresholdSeconds: number;
}

export interface NotificationOutboxMetricsEvaluation {
  level: 'log' | 'warn';
  reasons: Array<'backlog' | 'oldest_age'>;
}

export const evaluateNotificationOutboxMetrics = (
  metrics: NotificationOutboxMetrics,
): NotificationOutboxMetricsEvaluation => {
  const reasons: NotificationOutboxMetricsEvaluation['reasons'] = [];
  if (metrics.backlog >= metrics.backlogWarnThreshold) {
    reasons.push('backlog');
  }
  if (metrics.oldestUndeliveredAgeSeconds >= metrics.ageWarnThresholdSeconds) {
    reasons.push('oldest_age');
  }
  return { level: reasons.length > 0 ? 'warn' : 'log', reasons };
};
