import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInventoryCloseJobClaimWhere,
  getInventoryCloseLeaseUntil,
  INVENTORY_CLOSE_LEASE_MS,
} from './inventory-close-lease.util';

test('close-job claims can take queued jobs or recover running jobs with an expired/missing lease', () => {
  const now = new Date('2026-10-25T20:00:00.000Z');
  assert.deepEqual(buildInventoryCloseJobClaimWhere('job-1', now), {
    id: 'job-1',
    OR: [
      { status: 'queued' },
      {
        status: 'running',
        OR: [{ leaseUntil: { lte: now } }, { leaseUntil: null }],
      },
    ],
  });
});

test('lease duration is bounded and calculated from the supplied clock', () => {
  const now = new Date('2026-10-25T20:00:00.000Z');
  assert.equal(getInventoryCloseLeaseUntil(now).getTime(), now.getTime() + INVENTORY_CLOSE_LEASE_MS);
});
