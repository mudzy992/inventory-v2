import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { applyDestAcceptLotUpdatesInTx } from './utils/relocation-lot-accounting.util';

type LotRow = {
  id: string;
  warehouseId: string;
  quantityReceived: number;
  quantityOnHand: number;
  incomingRelocation: boolean;
  catalogItemId: string | null;
};

const createTx = (lots: Record<string, LotRow>) => {
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];

  return {
    updates,
    tx: {
      warehouseStockLot: {
        findUnique: async ({ where }: { where: { id: string } }) => lots[where.id] ?? null,
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push({ id: where.id, data });
          const lot = lots[where.id];
          if (!lot) {
            return lot;
          }
          if (data.incomingRelocation === false) {
            lot.incomingRelocation = false;
          }
          const received = data.quantityReceived as { increment?: number; decrement?: number } | undefined;
          if (received?.increment) {
            lot.quantityReceived += received.increment;
          }
          if (received?.decrement) {
            lot.quantityReceived -= received.decrement;
          }
          const onHand = data.quantityOnHand as { increment?: number } | undefined;
          if (onHand?.increment) {
            lot.quantityOnHand += onHand.increment;
          }
          return lot;
        },
      },
    },
  };
};

describe('applyDestAcceptLotUpdatesInTx', () => {
  it('decrements source received and increments dest received only for zaduzeno', async () => {
    const lots: Record<string, LotRow> = {
      'lot-a': {
        id: 'lot-a',
        warehouseId: 'wh-a',
        quantityReceived: 6,
        quantityOnHand: 5,
        incomingRelocation: false,
        catalogItemId: 'cat-1',
      },
      'lot-b': {
        id: 'lot-b',
        warehouseId: 'wh-b',
        quantityReceived: 0,
        quantityOnHand: 0,
        incomingRelocation: true,
        catalogItemId: 'cat-1',
      },
    };
    const { tx, updates } = createTx(lots);

    const result = await applyDestAcceptLotUpdatesInTx(tx as never, {
      equipment: { status: 'zaduzeno', stockLotId: 'lot-a' },
      fromWarehouseId: 'wh-a',
      destStockLotId: 'lot-b',
    });

    assert.equal(result.sourceStockLotId, 'lot-a');
    assert.equal(result.destStockLotId, 'lot-b');
    assert.equal(lots['lot-a'].quantityReceived, 5);
    assert.equal(lots['lot-a'].quantityOnHand, 5);
    assert.equal(lots['lot-b'].quantityReceived, 1);
    assert.equal(lots['lot-b'].quantityOnHand, 0);
    assert.equal(lots['lot-b'].incomingRelocation, false);
    assert.equal(updates.length, 2);
    assert.equal(updates[1]?.data.quantityOnHand, undefined);
  });

  it('increments dest onHand when equipment is skladiste', async () => {
    const lots: Record<string, LotRow> = {
      'lot-a': {
        id: 'lot-a',
        warehouseId: 'wh-a',
        quantityReceived: 2,
        quantityOnHand: 1,
        incomingRelocation: false,
        catalogItemId: 'cat-1',
      },
      'lot-b': {
        id: 'lot-b',
        warehouseId: 'wh-b',
        quantityReceived: 0,
        quantityOnHand: 0,
        incomingRelocation: true,
        catalogItemId: 'cat-1',
      },
    };
    const { tx } = createTx(lots);

    await applyDestAcceptLotUpdatesInTx(tx as never, {
      equipment: { status: 'skladiste', stockLotId: 'lot-a' },
      fromWarehouseId: 'wh-a',
      destStockLotId: 'lot-b',
    });

    assert.equal(lots['lot-b'].quantityReceived, 1);
    assert.equal(lots['lot-b'].quantityOnHand, 1);
  });

  it('skips source decrement when equipment has no stockLotId', async () => {
    const lots: Record<string, LotRow> = {
      'lot-b': {
        id: 'lot-b',
        warehouseId: 'wh-b',
        quantityReceived: 0,
        quantityOnHand: 0,
        incomingRelocation: true,
        catalogItemId: 'cat-1',
      },
    };
    const { tx, updates } = createTx(lots);

    const result = await applyDestAcceptLotUpdatesInTx(tx as never, {
      equipment: { status: 'zaduzeno', stockLotId: null },
      fromWarehouseId: 'wh-a',
      destStockLotId: 'lot-b',
    });

    assert.equal(result.sourceStockLotId, null);
    assert.equal(updates.length, 1);
    assert.equal(lots['lot-b'].quantityReceived, 1);
  });

  it('rejects when source lot belongs to another warehouse', async () => {
    const lots: Record<string, LotRow> = {
      'lot-a': {
        id: 'lot-a',
        warehouseId: 'wh-other',
        quantityReceived: 6,
        quantityOnHand: 5,
        incomingRelocation: false,
        catalogItemId: 'cat-1',
      },
      'lot-b': {
        id: 'lot-b',
        warehouseId: 'wh-b',
        quantityReceived: 0,
        quantityOnHand: 0,
        incomingRelocation: true,
        catalogItemId: 'cat-1',
      },
    };
    const { tx } = createTx(lots);

    await assert.rejects(
      () =>
        applyDestAcceptLotUpdatesInTx(tx as never, {
          equipment: { status: 'zaduzeno', stockLotId: 'lot-a' },
          fromWarehouseId: 'wh-a',
          destStockLotId: 'lot-b',
        }),
      BadRequestException,
    );
  });
});
