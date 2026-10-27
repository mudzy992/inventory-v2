import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  rateLimitMetricsRegistry,
  recordRateLimitDecision,
  type RateLimitMetricsSnapshot,
} from '../../../redis/rate-limit-metrics.registry';
import {
  DEFAULT_RATE_LIMIT_METRICS_THRESHOLDS,
  evaluateRateLimitMetrics,
  RATE_LIMIT_METRICS_INTERVAL_MS,
  RATE_LIMIT_WARN_CONSECUTIVE_FAILURES,
  RATE_LIMIT_WARN_EXCEEDED_COUNT,
  RATE_LIMIT_WARN_FAIL_OPEN_COUNT,
  type RateLimitMetricsThresholds,
} from './rate-limit-metrics.util';

const at = new Date('2026-10-27T11:00:00.000Z');

const makeSnapshot = (
  overrides: Partial<RateLimitMetricsSnapshot> = {},
): RateLimitMetricsSnapshot => ({
  observedAt: at.toISOString(),
  startedAt: at.toISOString(),
  intervalStartedAt: at.toISOString(),
  intervalEndedAt: at.toISOString(),
  totalDecisions: 0,
  intervalDecisions: 0,
  byOutcome: { allowed: 0, exceeded: 0, fail_open: 0, fail_closed: 0 },
  byPolicy: {},
  byFailureReason: { timeout: 0, connection: 0, invalid_counter: 0, unknown: 0 },
  intervalAllowed: 0,
  intervalExceeded: 0,
  intervalFailOpen: 0,
  intervalFailClosed: 0,
  intervalFailures: 0,
  totalFailures: 0,
  consecutiveFailures: 0,
  maxConsecutiveFailures: 0,
  secondsSinceLastFailure: null,
  lastFailureAt: null,
  lastFailureReason: null,
  lastFailurePolicy: null,
  overflowPolicies: 0,
  ...overrides,
});

describe('rate-limit metrics defaults', () => {
  it('uses a 30-second interval and documented thresholds', () => {
    assert.equal(RATE_LIMIT_METRICS_INTERVAL_MS, 30_000);
    assert.equal(RATE_LIMIT_WARN_FAIL_OPEN_COUNT, 5);
    assert.equal(RATE_LIMIT_WARN_CONSECUTIVE_FAILURES, 3);
    assert.equal(RATE_LIMIT_WARN_EXCEEDED_COUNT, 25);
    assert.deepEqual(DEFAULT_RATE_LIMIT_METRICS_THRESHOLDS, {
      warnFailOpenCount: 5,
      warnConsecutiveFailures: 3,
      warnExceededCount: 25,
    });
  });
});

describe('evaluateRateLimitMetrics', () => {
  it('stays quiet for healthy traffic and an empty interval', () => {
    const healthy = makeSnapshot({
      intervalDecisions: 100,
      intervalAllowed: 95,
      intervalExceeded: 5,
    });
    assert.deepEqual(evaluateRateLimitMetrics(healthy), { level: 'log', reasons: [] });
    assert.deepEqual(evaluateRateLimitMetrics(makeSnapshot()), { level: 'log', reasons: [] });
  });

  it('warns for any fail-closed rejection even without a burst', () => {
    const evaluation = evaluateRateLimitMetrics(
      makeSnapshot({ intervalDecisions: 1, intervalFailClosed: 1, intervalFailures: 1 }),
    );
    assert.equal(evaluation.level, 'warn');
    assert.deepEqual(evaluation.reasons, ['fail_closed']);
  });

  it('warns for a sustained outage even when the interval was drained', () => {
    const evaluation = evaluateRateLimitMetrics(
      makeSnapshot({ consecutiveFailures: 3, maxConsecutiveFailures: 7 }),
    );
    assert.deepEqual(evaluation.reasons, ['sustained_outage']);
  });

  it('warns for fail-open and 429 bursts at their thresholds', () => {
    const evaluation = evaluateRateLimitMetrics(
      makeSnapshot({ intervalFailOpen: 5, intervalExceeded: 25 }),
    );
    assert.deepEqual(evaluation.reasons, ['fail_open_burst', 'exceeded_burst']);
  });

  it('returns reasons in a stable severity order', () => {
    const evaluation = evaluateRateLimitMetrics(
      makeSnapshot({
        intervalFailClosed: 2,
        consecutiveFailures: 9,
        intervalFailOpen: 12,
        intervalExceeded: 30,
      }),
    );
    assert.deepEqual(evaluation.reasons, [
      'fail_closed',
      'sustained_outage',
      'fail_open_burst',
      'exceeded_burst',
    ]);
  });

  it('honours custom thresholds and exact boundary values', () => {
    const thresholds: RateLimitMetricsThresholds = {
      warnFailOpenCount: 2,
      warnConsecutiveFailures: 5,
      warnExceededCount: 1,
    };
    const snapshot = makeSnapshot({
      intervalFailOpen: 2,
      consecutiveFailures: 4,
      intervalExceeded: 1,
    });
    assert.deepEqual(evaluateRateLimitMetrics(snapshot, thresholds), {
      level: 'warn',
      reasons: ['fail_open_burst', 'exceeded_burst'],
    });
    const relaxed = evaluateRateLimitMetrics(snapshot, {
      warnFailOpenCount: 3,
      warnConsecutiveFailures: 5,
      warnExceededCount: 2,
    });
    assert.deepEqual(relaxed, { level: 'log', reasons: [] });
  });

  it('evaluates a real registry snapshot after a mixed outage', () => {
    rateLimitMetricsRegistry.reset(at);
    for (let index = 0; index < 6; index += 1) {
      recordRateLimitDecision({
        policy: 'login',
        outcome: 'fail_open',
        error: new Error('connect ECONNREFUSED'),
        at,
      });
    }
    const snapshot = rateLimitMetricsRegistry.snapshot(at);
    assert.equal(snapshot.intervalFailOpen, 6);
    assert.equal(snapshot.byFailureReason.connection, 6);
    assert.deepEqual(evaluateRateLimitMetrics(snapshot).reasons, [
      'sustained_outage',
      'fail_open_burst',
    ]);
    rateLimitMetricsRegistry.reset(at);
  });
});
