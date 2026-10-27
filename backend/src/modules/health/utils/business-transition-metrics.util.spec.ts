import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  businessTransitionMetricsRegistry,
  recordConditionalTransition,
  type BusinessTransitionMetricsSnapshot,
} from '../../../common/metrics/business-transition-metrics.registry';
import {
  BUSINESS_MIN_TRANSITION_COUNT,
  BUSINESS_TRANSITION_METRICS_INTERVAL_MS,
  BUSINESS_WARN_FAILED_TERMINAL_COUNT,
  BUSINESS_WARN_REJECTED_COUNT,
  BUSINESS_WARN_REJECTED_RATE_PERCENT,
  DEFAULT_BUSINESS_TRANSITION_METRICS_THRESHOLDS,
  evaluateBusinessTransitionMetrics,
  type BusinessTransitionMetricsThresholds,
} from './business-transition-metrics.util';

const at = new Date('2026-10-27T12:00:00.000Z');

const makeSnapshot = (
  overrides: Partial<BusinessTransitionMetricsSnapshot> = {},
): BusinessTransitionMetricsSnapshot => ({
  observedAt: at.toISOString(),
  startedAt: at.toISOString(),
  intervalStartedAt: at.toISOString(),
  intervalEndedAt: at.toISOString(),
  totalTransitions: 0,
  intervalTransitions: 0,
  applied: 0,
  rejected: 0,
  rejectedRatePercent: 0,
  terminalDone: 0,
  terminalFailed: 0,
  byOutcome: { applied: 0, rejected: 0 },
  byOperation: {},
  byTransition: {},
  consecutiveRejections: 0,
  maxConsecutiveRejections: 0,
  secondsSinceLastRejection: null,
  lastRejectionAt: null,
  lastRejectedOperation: null,
  overflowOperations: 0,
  overflowTransitions: 0,
  ...overrides,
});

describe('business transition metrics defaults', () => {
  it('uses a 30-second interval and documented thresholds', () => {
    assert.equal(BUSINESS_TRANSITION_METRICS_INTERVAL_MS, 30_000);
    assert.equal(BUSINESS_WARN_REJECTED_COUNT, 20);
    assert.equal(BUSINESS_WARN_REJECTED_RATE_PERCENT, 10);
    assert.equal(BUSINESS_WARN_FAILED_TERMINAL_COUNT, 10);
    assert.equal(BUSINESS_MIN_TRANSITION_COUNT, 20);
    assert.deepEqual(DEFAULT_BUSINESS_TRANSITION_METRICS_THRESHOLDS, {
      warnRejectedCount: 20,
      warnRejectedRatePercent: 10,
      warnFailedTerminalCount: 10,
      minTransitionCount: 20,
    });
  });
});

describe('evaluateBusinessTransitionMetrics', () => {
  it('stays quiet for healthy and empty intervals', () => {
    assert.deepEqual(evaluateBusinessTransitionMetrics(makeSnapshot()), {
      level: 'log',
      reasons: [],
    });
    assert.deepEqual(
      evaluateBusinessTransitionMetrics(
        makeSnapshot({ intervalTransitions: 100, applied: 98, rejected: 2, rejectedRatePercent: 2 }),
      ),
      { level: 'log', reasons: [] },
    );
  });

  it('warns about terminal failures at the threshold', () => {
    const evaluation = evaluateBusinessTransitionMetrics(
      makeSnapshot({ intervalTransitions: 10, applied: 10, terminalFailed: 10 }),
    );
    assert.equal(evaluation.level, 'warn');
    assert.deepEqual(evaluation.reasons, ['terminal_failures']);
  });

  it('warns about a rejection burst regardless of sample size', () => {
    assert.deepEqual(
      evaluateBusinessTransitionMetrics(
        makeSnapshot({ intervalTransitions: 20, rejected: 20, rejectedRatePercent: 100 }),
      ).reasons,
      ['rejected_burst', 'rejected_rate'],
    );
    assert.deepEqual(
      evaluateBusinessTransitionMetrics(makeSnapshot({ intervalTransitions: 20, rejected: 20 })).reasons,
      ['rejected_burst'],
    );
  });

  it('requires a minimum sample before the rejection-rate warning', () => {
    const few = evaluateBusinessTransitionMetrics(
      makeSnapshot({ intervalTransitions: 4, rejected: 2, rejectedRatePercent: 50 }),
    );
    assert.deepEqual(few.reasons, []);
    const enough = evaluateBusinessTransitionMetrics(
      makeSnapshot({ intervalTransitions: 20, rejected: 2, rejectedRatePercent: 10 }),
    );
    assert.deepEqual(enough.reasons, ['rejected_rate']);
  });

  it('returns reasons in a stable order', () => {
    const evaluation = evaluateBusinessTransitionMetrics(
      makeSnapshot({
        intervalTransitions: 50,
        rejected: 25,
        rejectedRatePercent: 50,
        terminalFailed: 12,
      }),
    );
    assert.deepEqual(evaluation.reasons, [
      'terminal_failures',
      'rejected_burst',
      'rejected_rate',
    ]);
  });

  it('honours custom thresholds', () => {
    const thresholds: BusinessTransitionMetricsThresholds = {
      warnRejectedCount: 2,
      warnRejectedRatePercent: 50,
      warnFailedTerminalCount: 2,
      minTransitionCount: 2,
    };
    const snapshot = makeSnapshot({
      intervalTransitions: 4,
      rejected: 2,
      rejectedRatePercent: 50,
      terminalFailed: 2,
    });
    assert.deepEqual(evaluateBusinessTransitionMetrics(snapshot, thresholds).reasons, [
      'terminal_failures',
      'rejected_burst',
      'rejected_rate',
    ]);
    const relaxed = evaluateBusinessTransitionMetrics(snapshot, {
      warnRejectedCount: 3,
      warnRejectedRatePercent: 51,
      warnFailedTerminalCount: 3,
      minTransitionCount: 5,
    });
    assert.deepEqual(relaxed, { level: 'log', reasons: [] });
  });

  it('evaluates a real registry snapshot from mixed conditional writes', () => {
    businessTransitionMetricsRegistry.reset(at);
    for (let index = 0; index < 20; index += 1) {
      recordConditionalTransition('document_job_terminal', index < 12 ? 1 : 0, {
        fromStatus: 'queued|running',
        toStatus: index < 10 ? 'done' : 'failed',
        terminal: index < 10 ? 'done' : 'failed',
        at,
      });
    }
    const snapshot = businessTransitionMetricsRegistry.snapshot(at);
    assert.equal(snapshot.applied, 12);
    assert.equal(snapshot.rejected, 8);
    assert.equal(snapshot.terminalDone, 10);
    assert.equal(snapshot.terminalFailed, 2);
    assert.equal(snapshot.rejectedRatePercent, 40);
    assert.deepEqual(evaluateBusinessTransitionMetrics(snapshot).reasons, ['rejected_rate']);
    businessTransitionMetricsRegistry.reset(at);
  });
});
