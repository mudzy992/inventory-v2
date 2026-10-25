import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { claimDisposalApprovalReviewInTx } from './claim-disposal-approval-review.util';

test('claims a pending disposal approval with a conditional update', async () => {
  let args: unknown;
  const tx = {
    disposalInventoryApproval: {
      updateMany: async (input: unknown) => {
        args = input;
        return { count: 1 };
      },
    },
  };
  const data = { status: 'approved', reviewedByUserId: 'user-1' };
  await claimDisposalApprovalReviewInTx(tx as never, 'approval-1', data as never);
  assert.deepEqual(args, {
    where: { id: 'approval-1', status: 'pending' },
    data,
  });
});

test('rejects a review if another request already claimed the approval', async () => {
  const tx = { disposalInventoryApproval: { updateMany: async () => ({ count: 0 }) } };
  await assert.rejects(
    () =>
      claimDisposalApprovalReviewInTx(tx as never, 'approval-1', { status: 'approved' } as never),
    BadRequestException,
  );
});
