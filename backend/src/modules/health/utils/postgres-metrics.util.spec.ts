import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPostgresMetricsSnapshot,
  evaluatePostgresMetrics,
  postgresPoolUtilizationPercent,
  type PostgresMetricsThresholds,
} from './postgres-metrics.util';

const thresholds: PostgresMetricsThresholds = {
  warnLatencyMs: 250,
  warnWaitingCount: 1,
  warnUtilizationPercent: 90,
};

describe('postgresPoolUtilizationPercent', () => {
  it('rounds utilization and caps it at 100 percent', () => {
    assert.equal(postgresPoolUtilizationPercent(4, 10), 40);
    assert.equal(postgresPoolUtilizationPercent(2, 3), 67);
    assert.equal(postgresPoolUtilizationPercent(20, 10), 100);
  });

  it('returns zero when the pool maximum is unknown', () => {
    assert.equal(postgresPoolUtilizationPercent(0, 10), 0);
    assert.equal(postgresPoolUtilizationPercent(3, 0), 0);
  });
});

describe('buildPostgresMetricsSnapshot', () => {
  it('copies live pool counters and configured thresholds', () => {
    const snapshot = buildPostgresMetricsSnapshot(
      { max: 10, total: 4, idle: 3, waiting: 0 },
      12,
      'connected',
      thresholds,
      new Date('2026-10-26T09:00:00.000Z'),
    );
    assert.deepEqual(snapshot, {
      observedAt: '2026-10-26T09:00:00.000Z',
      dbState: 'connected',
      latencyMs: 12,
      poolMax: 10,
      poolTotal: 4,
      poolIdle: 3,
      poolWaiting: 0,
      poolUtilizationPercent: 40,
      poolUnavailable: false,
      ...thresholds,
    });
  });

  it('marks the pool unavailable without inventing counters', () => {
    const snapshot = buildPostgresMetricsSnapshot(
      null,
      null,
      'error',
      thresholds,
      new Date('2026-10-26T09:01:00.000Z'),
    );
    assert.equal(snapshot.poolUnavailable, true);
    assert.equal(snapshot.poolMax, 0);
    assert.equal(snapshot.poolTotal, 0);
    assert.equal(snapshot.latencyMs, null);
  });
});

describe('evaluatePostgresMetrics', () => {
  it('keeps healthy snapshots at log level', () => {
    const snapshot = buildPostgresMetricsSnapshot(
      { max: 10, total: 4, idle: 3, waiting: 0 },
      12,
      'connected',
      thresholds,
    );
    assert.deepEqual(evaluatePostgresMetrics(snapshot), { level: 'log', reasons: [] });
  });

  it('reports database errors, slow probes, waiting clients and saturation', () => {
    const snapshot = buildPostgresMetricsSnapshot(
      { max: 10, total: 10, idle: 0, waiting: 2 },
      300,
      'error',
      thresholds,
    );
    assert.deepEqual(evaluatePostgresMetrics(snapshot), {
      level: 'warn',
      reasons: ['db_error', 'latency', 'pool_waiting', 'utilization'],
    });
  });

  it('reports a missing pool registry separately from a failed query', () => {
    const snapshot = buildPostgresMetricsSnapshot(null, 12, 'connected', thresholds);
    assert.deepEqual(evaluatePostgresMetrics(snapshot), {
      level: 'warn',
      reasons: ['pool_unavailable'],
    });
  });
});
