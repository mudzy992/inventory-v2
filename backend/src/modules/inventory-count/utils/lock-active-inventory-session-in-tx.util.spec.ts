import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { lockActiveInventorySessionInTx } from './lock-active-inventory-session-in-tx.util';

test('accepts a session row that is active and locked for the transaction', async () => {
  let queryCount = 0;
  const tx = {
    $queryRaw: async () => {
      queryCount += 1;
      return [{ id: 'session-1' }];
    },
  };
  await lockActiveInventorySessionInTx(tx as never, 'session-1');
  assert.equal(queryCount, 1);
});

test('rejects when the session is no longer active', async () => {
  const tx = { $queryRaw: async () => [] };
  await assert.rejects(
    () => lockActiveInventorySessionInTx(tx as never, 'session-1'),
    BadRequestException,
  );
});
