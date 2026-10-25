import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { claimTransferForFinalizeInTx } from './claim-transfer-finalize.util';

test('conditionally claims only an open transfer before applying finalization data', async () => {
  let args: unknown;
  const tx = {
    transfer: {
      updateMany: async (input: unknown) => {
        args = input;
        return { count: 1 };
      },
    },
  };
  const data = { status: 'potpisan', signerId: 'signer-1' };
  await claimTransferForFinalizeInTx(tx as never, 'transfer-1', data as never);
  assert.deepEqual(args, {
    where: { id: 'transfer-1', status: { in: ['raw', 'printed', 'uploaded'] } },
    data,
  });
});

test('rejects when a concurrent request already finalized or cancelled the transfer', async () => {
  const tx = { transfer: { updateMany: async () => ({ count: 0 }) } };
  await assert.rejects(
    () => claimTransferForFinalizeInTx(tx as never, 'transfer-1', { status: 'potpisan' } as never),
    BadRequestException,
  );
});
