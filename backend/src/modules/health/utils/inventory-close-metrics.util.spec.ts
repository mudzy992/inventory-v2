import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ageSecondsFromDate,
  buildInventoryCloseMetricsSnapshot,
  DEFAULT_INVENTORY_CLOSE_METRICS_THRESHOLDS,
  evaluateInventoryCloseMetrics,
  INVENTORY_CLOSE_METRICS_INTERVAL_MS,
  type InventoryCloseMetricsSnapshot,
  type InventoryCloseMetricsThresholds,
  type InventoryCloseStatusGroup,
} from './inventory-close-metrics.util';

const now = new Date('2026-10-27T10:00:00.000Z');
const secondsAgo = (seconds: number): Date => new Date(now.getTime() - seconds * 1_000);
const thresholds = DEFAULT_INVENTORY_CLOSE_METRICS_THRESHOLDS;

const group = (
  status: InventoryCloseStatusGroup['status'],
  count: number,
  oldestCreatedAt: Date | null = null,
  oldestStartedAt: Date | null = null,
  oldestUpdatedAt: Date | null = null,
): InventoryCloseStatusGroup => ({
  status,
  count,
  oldestCreatedAt,
  oldestStartedAt,
  oldestUpdatedAt,
});

const build = (
  groups: InventoryCloseStatusGroup[],
  expiredLeaseCount = 0,
  override: Partial<InventoryCloseMetricsThresholds> = {},
): InventoryCloseMetricsSnapshot =>
  buildInventoryCloseMetricsSnapshot({
    groups,
    expiredLeaseCount,
    now,
    thresholds: { ...thresholds, ...override },
  });

describe('inventory close metrics defaults', () => {
  it('uses a 30-second interval and documented warning thresholds', () => {
    assert.equal(INVENTORY_CLOSE_METRICS_INTERVAL_MS, 30_000);
    assert.deepEqual(thresholds, {
      warnPendingCount: 10,
      warnQueuedAgeSeconds: 300,
      warnRunningAgeSeconds: 1_800,
      warnFailedAgeSeconds: 300,
    });
  });
});

describe('ageSecondsFromDate', () => {
  it('returns zero for missing or invalid timestamps and clamps future values', () => {
    assert.equal(ageSecondsFromDate(null, now), 0);
    assert.equal(ageSecondsFromDate(undefined, now), 0);
    assert.equal(ageSecondsFromDate(new Date('invalid'), now), 0);
    assert.equal(ageSecondsFromDate(new Date(now.getTime() + 5_000), now), 0);
    assert.equal(ageSecondsFromDate(secondsAgo(61.9), now), 61);
  });
});

describe('buildInventoryCloseMetricsSnapshot', () => {
  it('maps status groups into counts, pending totals and per-status ages', () => {
    const snapshot = build(
      [
        group('queued', 3, secondsAgo(600)),
        group('running', 2, secondsAgo(4_000), secondsAgo(3_600)),
        group('failed', 1, secondsAgo(5_000), null, secondsAgo(900)),
        group('done', 12, secondsAgo(9_000)),
      ],
      1,
    );
    assert.equal(snapshot.observedAt, now.toISOString());
    assert.equal(snapshot.queued, 3);
    assert.equal(snapshot.running, 2);
    assert.equal(snapshot.failed, 1);
    assert.equal(snapshot.done, 12);
    assert.equal(snapshot.pending, 5);
    assert.equal(snapshot.expiredLeaseCount, 1);
    assert.equal(snapshot.oldestQueuedAgeSeconds, 600);
    assert.equal(snapshot.oldestRunningAgeSeconds, 3_600);
    assert.equal(snapshot.oldestFailedAgeSeconds, 5_000);
    assert.equal(snapshot.warnPendingCount, 10);
  });

  it('falls back to createdAt for running/failed groups without started/updated timestamps', () => {
    const snapshot = build([
      group('running', 1, secondsAgo(2_000)),
      group('failed', 1, secondsAgo(400)),
    ]);
    assert.equal(snapshot.oldestRunningAgeSeconds, 2_000);
    assert.equal(snapshot.oldestFailedAgeSeconds, 400);
  });

  it('handles an empty database and malformed aggregate values', () => {
    const empty = build([], Number.NaN);
    assert.equal(empty.pending, 0);
    assert.equal(empty.expiredLeaseCount, 0);
    assert.equal(empty.oldestQueuedAgeSeconds, 0);
    assert.deepEqual(evaluateInventoryCloseMetrics(empty), { level: 'log', reasons: [] });

    const malformed = build([group('queued', -5), group('running', 2.9)], -3);
    assert.equal(malformed.queued, 0);
    assert.equal(malformed.running, 2);
    assert.equal(malformed.pending, 2);
    assert.equal(malformed.expiredLeaseCount, 0);
  });
});

describe('evaluateInventoryCloseMetrics', () => {
  it('stays quiet for a healthy snapshot', () => {
    const snapshot = build([
      group('queued', 1, secondsAgo(30)),
      group('running', 1, secondsAgo(60), secondsAgo(50)),
      group('done', 20, secondsAgo(2_000)),
    ]);
    assert.deepEqual(evaluateInventoryCloseMetrics(snapshot), { level: 'log', reasons: [] });
  });

  it('reports every reason in a stable order', () => {
    const snapshot = build(
      [
        group('queued', 9, secondsAgo(600)),
        group('running', 2, secondsAgo(4_000), secondsAgo(3_600)),
        group('failed', 1, secondsAgo(5_000), null, secondsAgo(900)),
      ],
      1,
    );
    assert.equal(snapshot.pending, 11);
    assert.deepEqual(evaluateInventoryCloseMetrics(snapshot), {
      level: 'warn',
      reasons: ['pending_backlog', 'queued_age', 'running_age', 'expired_lease', 'failed_age'],
    });
  });

  it('warns about any expired lease even with a single stale job', () => {
    const snapshot = build([group('running', 1, secondsAgo(10), secondsAgo(9))], 1);
    assert.deepEqual(evaluateInventoryCloseMetrics(snapshot).reasons, ['expired_lease']);
  });

  it('does not warn for a recent failed job that is still within the retry window', () => {
    const snapshot = build([group('failed', 1, secondsAgo(10), null, secondsAgo(5))]);
    assert.deepEqual(evaluateInventoryCloseMetrics(snapshot).reasons, []);
    assert.deepEqual(
      evaluateInventoryCloseMetrics(build([group('failed', 1, secondsAgo(400))])).reasons,
      ['failed_age'],
    );
  });

  it('honours thresholds carried by the snapshot', () => {
    const groups = [
      group('queued', 2, secondsAgo(50)),
      group('running', 1, secondsAgo(70), secondsAgo(60)),
      group('failed', 1, secondsAgo(40), null, secondsAgo(35)),
    ];
    const relaxed = build(groups, 0, {
      warnPendingCount: 100,
      warnQueuedAgeSeconds: 10_000,
      warnRunningAgeSeconds: 10_000,
      warnFailedAgeSeconds: 10_000,
    });
    assert.deepEqual(evaluateInventoryCloseMetrics(relaxed).reasons, []);

    const strict = build(groups, 0, {
      warnPendingCount: 3,
      warnQueuedAgeSeconds: 40,
      warnRunningAgeSeconds: 50,
      warnFailedAgeSeconds: 30,
    });
    assert.deepEqual(evaluateInventoryCloseMetrics(strict).reasons, [
      'pending_backlog',
      'queued_age',
      'running_age',
      'failed_age',
    ]);
  });
});
