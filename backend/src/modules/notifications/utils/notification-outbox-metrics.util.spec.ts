import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateNotificationOutboxMetrics,
  NOTIFICATION_OUTBOX_WARN_AGE_SECONDS,
  NOTIFICATION_OUTBOX_WARN_BACKLOG_COUNT,
  type NotificationOutboxMetrics,
} from './notification-outbox-metrics.util';

const metrics = (
  overrides: Partial<NotificationOutboxMetrics> = {},
): NotificationOutboxMetrics => ({
  pending: 1,
  running: 0,
  backlog: 1,
  oldestUndeliveredAgeSeconds: 10,
  oldestStatus: 'pending',
  oldestAttempts: 0,
  backlogWarnThreshold: NOTIFICATION_OUTBOX_WARN_BACKLOG_COUNT,
  ageWarnThresholdSeconds: NOTIFICATION_OUTBOX_WARN_AGE_SECONDS,
  ...overrides,
});

test('healthy notification outbox backlog produces a routine log', () => {
  assert.deepEqual(evaluateNotificationOutboxMetrics(metrics()), { level: 'log', reasons: [] });
  assert.deepEqual(evaluateNotificationOutboxMetrics(metrics({ backlog: 0, oldestStatus: null, oldestAttempts: null, oldestUndeliveredAgeSeconds: 0 })), {
    level: 'log',
    reasons: [],
  });
});

test('backlog and oldest-age thresholds independently raise warnings', () => {
  assert.deepEqual(
    evaluateNotificationOutboxMetrics(metrics({ backlog: NOTIFICATION_OUTBOX_WARN_BACKLOG_COUNT })),
    { level: 'warn', reasons: ['backlog'] },
  );
  assert.deepEqual(
    evaluateNotificationOutboxMetrics(
      metrics({ oldestUndeliveredAgeSeconds: NOTIFICATION_OUTBOX_WARN_AGE_SECONDS }),
    ),
    { level: 'warn', reasons: ['oldest_age'] },
  );
  assert.deepEqual(
    evaluateNotificationOutboxMetrics(
      metrics({
        backlog: NOTIFICATION_OUTBOX_WARN_BACKLOG_COUNT + 1,
        oldestUndeliveredAgeSeconds: NOTIFICATION_OUTBOX_WARN_AGE_SECONDS + 1,
      }),
    ),
    { level: 'warn', reasons: ['backlog', 'oldest_age'] },
  );
});
