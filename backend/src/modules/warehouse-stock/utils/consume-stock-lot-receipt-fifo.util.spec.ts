import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { consumeStockLotReceiptFifoInTx } from './consume-stock-lot-receipt-fifo.util';

type ReceiptRow = {
  id: string;
  stockLotId: string;
  quantityRemaining: number;
  entryDate: Date;
  contractNumber: string | null;
  createdAt: Date;
};

const createTx = (input: { receipts: ReceiptRow[]; lotExists: boolean }) => {
  const updates: Array<{ id: string }> = [];
  return {
    updates,
    tx: {
      warehouseStockLotReceipt: {
        findFirst: async ({
          where,
          orderBy: _orderBy,
        }: {
          where: { stockLotId: string; quantityRemaining: { gt: number } };
          orderBy: Array<{ createdAt: 'asc' } | { id: 'asc' }>;
        }) => {
          const rows = input.receipts.filter(
            (r) => r.stockLotId === where.stockLotId && r.quantityRemaining > where.quantityRemaining.gt,
          );
          rows.sort((a, b) => {
            const byCreated = a.createdAt.getTime() - b.createdAt.getTime();
            if (byCreated !== 0) return byCreated;
            return a.id.localeCompare(b.id);
          });
          return (rows[0] as unknown) ?? null;
        },
        update: async ({ where }: { where: { id: string } }) => {
          updates.push(where);
          const row = input.receipts.find((r) => r.id === where.id);
          if (row) row.quantityRemaining -= 1;
          return row ?? null;
        },
      },
      warehouseStockLot: {
        findUnique: async () => (input.lotExists ? ({ id: 'lot-1' } as unknown) : null),
      },
    },
  };
};

describe('consumeStockLotReceiptFifoInTx', () => {
  it('consumes from oldest receipt with remaining > 0', async () => {
    const receipts: ReceiptRow[] = [
      {
        id: 'b',
        stockLotId: 'lot-1',
        quantityRemaining: 3,
        entryDate: new Date('2026-01-05'),
        contractNumber: 'U-1',
        createdAt: new Date('2026-01-05T10:00:00Z'),
      },
      {
        id: 'a',
        stockLotId: 'lot-1',
        quantityRemaining: 1,
        entryDate: new Date('2026-01-01'),
        contractNumber: null,
        createdAt: new Date('2026-01-01T10:00:00Z'),
      },
    ];
    const { tx, updates } = createTx({ receipts, lotExists: true });
    const result = await consumeStockLotReceiptFifoInTx(tx as never, 'lot-1');
    assert.equal(result.entryDate.toISOString().slice(0, 10), '2026-01-01');
    assert.equal(result.contractNumber, null);
    assert.deepEqual(updates, [{ id: 'a' }]);
    assert.equal(receipts.find((r) => r.id === 'a')?.quantityRemaining, 0);
  });

  it('throws NotFound when lot does not exist', async () => {
    const { tx } = createTx({ receipts: [], lotExists: false });
    await assert.rejects(() => consumeStockLotReceiptFifoInTx(tx as never, 'lot-missing'), (err) => {
      assert.ok(err instanceof NotFoundException);
      return true;
    });
  });

  it('throws BadRequest when lot exists but no receipts remaining', async () => {
    const { tx } = createTx({ receipts: [], lotExists: true });
    await assert.rejects(() => consumeStockLotReceiptFifoInTx(tx as never, 'lot-1'), (err) => {
      assert.ok(err instanceof BadRequestException);
      return true;
    });
  });
});

