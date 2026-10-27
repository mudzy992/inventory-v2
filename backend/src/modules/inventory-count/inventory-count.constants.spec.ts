import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COMMITTEE_SORT_FIELDS,
  INVENTORY_LINE_SORT_FIELDS,
  OPEN_INVENTORY_SESSION_STATUSES,
  SESSION_SORT_FIELDS,
  toPublicInventoryCloseJob,
} from './inventory-count.constants';

test('N-15: extracted query shapes keep their allow-list semantics', () => {
  assert.deepEqual(OPEN_INVENTORY_SESSION_STATUSES, ['draft', 'active', 'closing']);
  assert.deepEqual(Object.keys(SESSION_SORT_FIELDS), ['year', 'createdAt', 'name']);
  assert.deepEqual(Object.keys(COMMITTEE_SORT_FIELDS), ['createdAt']);
  assert.deepEqual(Object.keys(INVENTORY_LINE_SORT_FIELDS), ['createdAt', 'status']);
  for (const map of [SESSION_SORT_FIELDS, COMMITTEE_SORT_FIELDS, INVENTORY_LINE_SORT_FIELDS]) {
    for (const column of Object.values(map)) {
      assert.match(column, /^[A-Za-z]+$/u);
    }
  }
});

test('close-job mapper still returns exactly the public projection', () => {
  const createdAt = new Date('2026-01-02T03:04:05.000Z');
  const job = {
    id: 'j1', sessionId: 's1', status: 'done', totalCount: 2, appliedCount: 1,
    failedCount: 0, skippedCount: 1, startedAt: createdAt, endedAt: createdAt,
    lastError: null, createdAt, updatedAt: createdAt, secretToken: 'must-not-leak',
  };
  const mapped = toPublicInventoryCloseJob(job);
  assert.deepEqual(Object.keys(mapped).sort(), [
    'appliedCount', 'createdAt', 'endedAt', 'failedCount', 'id', 'lastError',
    'sessionId', 'skippedCount', 'startedAt', 'status', 'totalCount', 'updatedAt',
  ].sort());
  assert.equal((mapped as Record<string, unknown>)['secretToken'], undefined);
  assert.equal(mapped.totalCount, 2);
});
