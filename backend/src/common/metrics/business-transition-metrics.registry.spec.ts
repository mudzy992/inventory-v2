import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BUSINESS_METRICS_MAX_OPERATIONS,
  BUSINESS_METRICS_MAX_TRANSITIONS,
  businessTransitionMetricsRegistry,
  normalizeBusinessLabel,
  readTransitionTargetStatus,
  recordBusinessTransition,
  recordConditionalTransition,
  type BusinessTransitionEvent,
} from './business-transition-metrics.registry';

const at = new Date('2026-10-27T12:00:00.000Z');

const record = (overrides: Partial<BusinessTransitionEvent> = {}): void => {
  recordBusinessTransition({
    operation: 'transfer_open_status',
    outcome: 'applied',
    fromStatus: 'raw|printed',
    toStatus: 'finalized',
    at,
    ...overrides,
  });
};

describe('business transition label helpers', () => {
  it('normalises labels to a bounded safe alphabet', () => {
    assert.equal(normalizeBusinessLabel('Transfer_Finalize.V2'), 'transfer_finalize.v2');
    assert.equal(normalizeBusinessLabel('status with spaces'), 'status_with_spaces');
    assert.equal(normalizeBusinessLabel(''), 'other');
    assert.equal(normalizeBusinessLabel('x'.repeat(90)).length, 32);
  });

  it('reads only plain string status values from an update payload', () => {
    assert.equal(readTransitionTargetStatus({ status: 'finalized', note: 'x' }), 'finalized');
    assert.equal(readTransitionTargetStatus({ status: { set: 'done' } }), 'unknown');
    assert.equal(readTransitionTargetStatus({ quantity: 1 }), 'unchanged');
    assert.equal(readTransitionTargetStatus(null), 'unchanged');
  });
});

describe('businessTransitionMetricsRegistry', () => {
  it('counts applied and rejected compare-and-set results with terminal outcomes', () => {
    businessTransitionMetricsRegistry.reset(at);
    recordConditionalTransition('document_job_terminal', 1, {
      fromStatus: 'queued|running',
      toStatus: 'done',
      terminal: 'done',
      at,
    });
    recordConditionalTransition('document_job_terminal', 1, {
      fromStatus: 'queued|running',
      toStatus: 'failed',
      terminal: 'failed',
      at,
    });
    recordConditionalTransition('document_job_terminal', 0, {
      fromStatus: 'queued|running',
      toStatus: 'failed',
      terminal: 'failed',
      at,
    });
    record({ operation: 'transfer_open_status', outcome: 'applied' });

    const snapshot = businessTransitionMetricsRegistry.snapshot(at);
    assert.equal(snapshot.intervalTransitions, 4);
    assert.equal(snapshot.applied, 3);
    assert.equal(snapshot.rejected, 1);
    assert.equal(snapshot.rejectedRatePercent, 25);
    assert.equal(snapshot.terminalDone, 1);
    assert.equal(snapshot.terminalFailed, 1);
    assert.equal(snapshot.byOperation.document_job_terminal, 3);
    assert.equal(snapshot.byOperation.transfer_open_status, 1);
    assert.equal(snapshot.byTransition['queued_running->done'], 1);
    assert.equal(snapshot.byTransition['queued_running->failed'], 2);
    assert.equal(snapshot.byOutcome.applied, 3);
    assert.equal(snapshot.byOutcome.rejected, 1);
  });

  it('tracks consecutive rejections and clears them after an applied write', () => {
    businessTransitionMetricsRegistry.reset(at);
    record({ outcome: 'rejected', operation: 'stock_lot_fifo_consume' });
    record({ outcome: 'rejected', operation: 'stock_lot_fifo_consume' });
    const rejectedState = businessTransitionMetricsRegistry.snapshot(at);
    assert.equal(rejectedState.consecutiveRejections, 2);
    assert.equal(rejectedState.maxConsecutiveRejections, 2);
    assert.equal(rejectedState.lastRejectionAt, at.toISOString());
    assert.equal(rejectedState.lastRejectedOperation, 'stock_lot_fifo_consume');
    assert.equal(rejectedState.secondsSinceLastRejection, 0);

    record({ outcome: 'applied' });
    const recovered = businessTransitionMetricsRegistry.snapshot(at);
    assert.equal(recovered.consecutiveRejections, 0);
    assert.equal(recovered.maxConsecutiveRejections, 2);
  });

  it('drains only interval counters while lifetime totals and streak remain', () => {
    businessTransitionMetricsRegistry.reset(at);
    record({ outcome: 'rejected' });
    const later = new Date(at.getTime() + 40_000);
    const first = businessTransitionMetricsRegistry.consumeSnapshot(later);
    assert.equal(first.intervalTransitions, 1);
    assert.equal(first.secondsSinceLastRejection, 40);
    assert.equal(first.consecutiveRejections, 1);

    const second = businessTransitionMetricsRegistry.snapshot(later);
    assert.equal(second.intervalTransitions, 0);
    assert.equal(second.totalTransitions, 1);
    assert.equal(second.rejected, 0);
    assert.equal(second.consecutiveRejections, 1);
    assert.equal(second.intervalStartedAt, later.toISOString());
    assert.deepEqual(second.byOperation, {});
  });

  it('caps distinct operations and status transitions', () => {
    businessTransitionMetricsRegistry.reset(at);
    for (let index = 0; index < BUSINESS_METRICS_MAX_OPERATIONS + 3; index += 1) {
      record({ operation: `operation_${index}` });
    }
    for (let index = 0; index < BUSINESS_METRICS_MAX_TRANSITIONS + 2; index += 1) {
      record({
        operation: 'operation_0',
        fromStatus: `from_${index}`,
        toStatus: 'done',
      });
    }
    const snapshot = businessTransitionMetricsRegistry.snapshot(at);
    assert.equal(snapshot.overflowOperations, 3);
    assert.equal(snapshot.byOperation.other, 3);
    assert.ok(snapshot.overflowTransitions > 0);
    assert.equal(snapshot.byTransition['other->other'], snapshot.overflowTransitions);
    assert.equal(Object.keys(snapshot.byOperation).length, BUSINESS_METRICS_MAX_OPERATIONS + 1);
    assert.equal(Object.keys(snapshot.byTransition).length, BUSINESS_METRICS_MAX_TRANSITIONS + 1);
  });

  it('never stores entity IDs or error text in a snapshot', () => {
    businessTransitionMetricsRegistry.reset(at);
    record({ operation: 'transfer_open_status', at });
    const json = JSON.stringify(businessTransitionMetricsRegistry.snapshot(at));
    assert.ok(!json.includes('session-'));
    assert.ok(!json.includes('password'));
    assert.ok(json.includes('transfer_open_status'));
    assert.equal(Object.keys(JSON.parse(json)).includes('entityId'), false);
  });

  it('supports custom expected counts and never throws for malformed events', () => {
    businessTransitionMetricsRegistry.reset(at);
    recordConditionalTransition('bulk_claim', 3, { expectedCount: 3, at });
    recordConditionalTransition('bulk_claim', 2, { expectedCount: 3, at });
    assert.doesNotThrow(() =>
      recordBusinessTransition({ operation: 'broken', outcome: undefined as never, at }),
    );
    const snapshot = businessTransitionMetricsRegistry.snapshot(at);
    assert.equal(snapshot.byOperation.bulk_claim, 2);
    assert.equal(snapshot.applied, 1);
    assert.ok(snapshot.intervalTransitions >= 2);
    assert.equal(snapshot.secondsSinceLastRejection, 0);
  });

  it('handles empty state and invalid timestamps', () => {
    businessTransitionMetricsRegistry.reset(at);
    const empty = businessTransitionMetricsRegistry.snapshot(at);
    assert.equal(empty.intervalTransitions, 0);
    assert.equal(empty.rejectedRatePercent, 0);
    assert.equal(empty.secondsSinceLastRejection, null);
    assert.equal(empty.lastRejectionAt, null);
    assert.deepEqual(empty.byOutcome, { applied: 0, rejected: 0 });

    record({ at: new Date('invalid'), outcome: 'rejected' });
    assert.equal(businessTransitionMetricsRegistry.snapshot(at).intervalTransitions, 1);
  });

  it('reset clears all counters and rejection metadata', () => {
    businessTransitionMetricsRegistry.reset(at);
    record({ outcome: 'rejected' });
    businessTransitionMetricsRegistry.reset(new Date(at.getTime() + 60_000));
    const snapshot = businessTransitionMetricsRegistry.snapshot(at);
    assert.equal(snapshot.totalTransitions, 0);
    assert.equal(snapshot.consecutiveRejections, 0);
    assert.equal(snapshot.maxConsecutiveRejections, 0);
    assert.equal(snapshot.lastRejectionAt, null);
    assert.equal(snapshot.lastRejectedOperation, null);
  });
});
