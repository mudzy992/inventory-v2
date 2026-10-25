import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { decrementStockLotOnHandInTx } from './decrement-stock-lot-on-hand.util';

test('decrements only a ready lot with positive stock and closes it at zero', async () => {
  let quantityOnHand = 1;
  let status = 'spremno_za_izdavanje';
  const conditions: unknown[] = [];
  const tx = {
    warehouseStockLot: {
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        conditions.push(where);
        if ('quantityOnHand' in data) {
          if (status !== where.status || quantityOnHand <= 0) return { count: 0 };
          quantityOnHand -= 1;
          return { count: 1 };
        }
        if (status === where.status && quantityOnHand === where.quantityOnHand) {
          status = data.status as string;
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
  };

  await decrementStockLotOnHandInTx(tx as never, 'lot-1');
  assert.equal(quantityOnHand, 0);
  assert.equal(status, 'zatvoreno');
  assert.deepEqual(conditions, [
    { id: 'lot-1', status: 'spremno_za_izdavanje', quantityOnHand: { gt: 0 } },
    { id: 'lot-1', status: 'spremno_za_izdavanje', quantityOnHand: 0 },
  ]);
});

test('rejects when another transaction has already consumed the final unit', async () => {
  const tx = {
    warehouseStockLot: {
      updateMany: async () => ({ count: 0 }),
    },
  };
  await assert.rejects(
    () => decrementStockLotOnHandInTx(tx as never, 'lot-1'),
    BadRequestException,
  );
});
