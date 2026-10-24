import assert from 'node:assert/strict';
import test from 'node:test';
import { isFinalInventoryCloseAttempt } from './inventory-close-retry.util';

test('keeps the database job claimable while BullMQ attempts remain', () => {
  assert.equal(isFinalInventoryCloseAttempt(0, 3), false);
  assert.equal(isFinalInventoryCloseAttempt(1, 3), false);
  assert.equal(isFinalInventoryCloseAttempt(2, 3), true);
});

test('treats missing or invalid attempt limits as one attempt', () => {
  assert.equal(isFinalInventoryCloseAttempt(0, undefined), true);
  assert.equal(isFinalInventoryCloseAttempt(0, 0), true);
});
