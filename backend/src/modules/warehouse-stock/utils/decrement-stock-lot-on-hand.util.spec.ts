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
          const minimum = (where.quantityOnHand as { gte: number }).gte;
          const decrement = (data.quantityOnHand as { decrement: number }).decrement;
          if (status !== where.status || quantityOnHand < minimum) return { count: 0 };
          quantityOnHand -= decrement;
          return { count: 1 };
        }
        if (status === where.status && quantityOnHand === where.quantityOnHand) {
          status = data.status as string;
          return { count: 1 };
        }
        return { count: 0 };
      },
      findUnique: async () => ({ id: 'lot-1', quantityOnHand, status }),
    },
  };

  await decrementStockLotOnHandInTx(tx as never, 'lot-1');
  assert.equal(quantityOnHand, 0);
  assert.equal(status, 'zatvoreno');
  assert.deepEqual(conditions, [
    { id: 'lot-1', status: 'spremno_za_izdavanje', quantityOnHand: { gte: 1 } },
    { id: 'lot-1', status: 'spremno_za_izdavanje', quantityOnHand: 0 },
  ]);
});

test('supports atomic multi-unit decrements for maintenance stock', async () => {
  let quantityOnHand = 5;
  const status = 'spremno_za_izdavanje';
  const tx = {
    warehouseStockLot: {
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if ('quantityOnHand' in data) {
          const minimum = (where.quantityOnHand as { gte: number }).gte;
          const decrement = (data.quantityOnHand as { decrement: number }).decrement;
          if (quantityOnHand < minimum) return { count: 0 };
          quantityOnHand -= decrement;
          return { count: 1 };
        }
        return { count: 0 };
      },
      findUnique: async () => ({ id: 'lot-1', quantityOnHand, status }),
    },
  };

  await decrementStockLotOnHandInTx(tx as never, 'lot-1', 3, 'Insufficient quantity on stock lot');
  assert.equal(quantityOnHand, 2);
  assert.equal(status, 'spremno_za_izdavanje');
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
