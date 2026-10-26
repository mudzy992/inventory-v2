import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ageSecondsFromTimestamp,
  evaluateQueueMetrics,
  QUEUE_METRICS_WARN_ACTIVE_SECONDS,
  QUEUE_METRICS_WARN_BACKLOG_COUNT,
  QUEUE_METRICS_WARN_WAITING_SECONDS,
  type QueueMetricsSnapshot,
} from './queue-metrics.util';

const snapshot = (overrides: Partial<QueueMetricsSnapshot> = {}): QueueMetricsSnapshot => ({
  queue: 'inventory-close',
  waiting: 1,
  active: 0,
  delayed: 0,
  failed: 0,
  backlog: 1,
  oldestWaitingAgeSeconds: 10,
  oldestActiveAgeSeconds: 0,
  backlogWarnThreshold: QUEUE_METRICS_WARN_BACKLOG_COUNT,
  waitingWarnThresholdSeconds: QUEUE_METRICS_WARN_WAITING_SECONDS,
  activeWarnThresholdSeconds: QUEUE_METRICS_WARN_ACTIVE_SECONDS,
  ...overrides,
});

test('computes bounded age from BullMQ millisecond timestamps', () => {
  const now = new Date('2026-10-26T12:00:30.000Z');
  assert.equal(ageSecondsFromTimestamp(new Date('2026-10-26T12:00:00.000Z').getTime(), now), 30);
  assert.equal(ageSecondsFromTimestamp(now.getTime() + 5_000, now), 0);
  assert.equal(ageSecondsFromTimestamp(undefined, now), 0);
  assert.equal(ageSecondsFromTimestamp(Number.NaN, now), 0);
});

test('healthy queue metrics produce a routine log', () => {
  assert.deepEqual(evaluateQueueMetrics(snapshot()), { level: 'log', reasons: [] });
});

test('backlog, waiting lag and active duration independently raise warnings', () => {
  assert.deepEqual(
    evaluateQueueMetrics(snapshot({ backlog: QUEUE_METRICS_WARN_BACKLOG_COUNT })),
    { level: 'warn', reasons: ['backlog'] },
  );
  assert.deepEqual(
    evaluateQueueMetrics(
      snapshot({ oldestWaitingAgeSeconds: QUEUE_METRICS_WARN_WAITING_SECONDS }),
    ),
    { level: 'warn', reasons: ['waiting_age'] },
  );
  assert.deepEqual(
    evaluateQueueMetrics(
      snapshot({ oldestActiveAgeSeconds: QUEUE_METRICS_WARN_ACTIVE_SECONDS }),
    ),
    { level: 'warn', reasons: ['active_age'] },
  );
  assert.deepEqual(
    evaluateQueueMetrics(
      snapshot({
        backlog: QUEUE_METRICS_WARN_BACKLOG_COUNT + 1,
        oldestWaitingAgeSeconds: QUEUE_METRICS_WARN_WAITING_SECONDS + 1,
        oldestActiveAgeSeconds: QUEUE_METRICS_WARN_ACTIVE_SECONDS + 1,
      }),
    ),
    { level: 'warn', reasons: ['backlog', 'waiting_age', 'active_age'] },
  );
});
