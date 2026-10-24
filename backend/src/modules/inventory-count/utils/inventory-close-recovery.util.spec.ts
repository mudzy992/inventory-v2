import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInventoryCloseRecoveryJobId } from './inventory-close-recovery.util';

test('creates a stable BullMQ id for the same persisted job generation', () => {
  const updatedAt = new Date('2026-10-24T12:00:00.000Z');
  assert.equal(
    buildInventoryCloseRecoveryJobId('close-1', updatedAt),
    buildInventoryCloseRecoveryJobId('close-1', updatedAt),
  );
});

test('creates a new BullMQ id after the database job is re-queued', () => {
  assert.notEqual(
    buildInventoryCloseRecoveryJobId('close-1', new Date('2026-10-24T12:00:00.000Z')),
    buildInventoryCloseRecoveryJobId('close-1', new Date('2026-10-24T12:01:00.000Z')),
  );
});
