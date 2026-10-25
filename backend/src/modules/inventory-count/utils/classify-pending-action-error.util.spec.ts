import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPendingActionRetryDelayMs,
  isRetryablePendingActionError,
} from './classify-pending-action-error.util';

test('classifies only known transient database and connection errors as retryable', () => {
  for (const code of ['P1001', 'P2024', 'P2034', '40001', '40P01', 'ECONNRESET']) {
    assert.equal(isRetryablePendingActionError({ code }), true, `${code} should be retried`);
  }
  assert.equal(isRetryablePendingActionError({ meta: { code: 'P1008' } }), true);
  assert.equal(isRetryablePendingActionError({ cause: { code: '57P01' } }), true);
  assert.equal(isRetryablePendingActionError({ code: 'P2002' }), false);
  assert.equal(isRetryablePendingActionError({ status: 400, message: 'Invalid business state' }), false);
  assert.equal(isRetryablePendingActionError(new Error('database timeout')), false);
});

test('bounds retry backoff and rejects invalid retry numbers', () => {
  assert.equal(getPendingActionRetryDelayMs(1), 250);
  assert.equal(getPendingActionRetryDelayMs(2), 500);
  assert.equal(getPendingActionRetryDelayMs(3), 1_000);
  assert.equal(getPendingActionRetryDelayMs(10), 2_000);
  assert.throws(() => getPendingActionRetryDelayMs(0), RangeError);
});
