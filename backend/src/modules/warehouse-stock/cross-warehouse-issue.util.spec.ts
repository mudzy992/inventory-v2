import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import {
  applyCrossWarehouseIssueLotUpdatesInTx,
  findOrCreateDestLotInTx,
} from './utils/cross-warehouse-issue.util';

type LotRow = {
  id: string;
  warehouseId: string;
  categoryId: string;
  catalogItemId: string | null;
  productName: string;
  quantityReceived: number;
  quantityOnHand: number;
  incomingRelocation: boolean;
  status: string;
  specifications: unknown;
  specDefinedAt: Date | null;
};

type EquipmentRow = {
  id: string;
  stockLotId: string | null;
  catalogItemId: string | null;
};

const createTx = (
  lots: Record<string, LotRow>,
  equipment: Record<string, EquipmentRow>,
) => {
  const lotCreates: unknown[] = [];
  const equipmentUpdates: unknown[] = [];

  return {
    lotCreates,
    equipmentUpdates,
    tx: {
      warehouseStockLot: {
        findFirst: async ({
          where,
        }: {
          where: {
            warehouseId: string;
            catalogItemId: string;
            status: { not: string };
          };
        }) =>
          Object.values(lots).find(
            (row) =>
              row.warehouseId === where.warehouseId &&
              row.catalogItemId === where.catalogItemId &&
              row.status !== where.status.not,
          ) ?? null,
        findMany: async () => [],
        findUnique: async ({ where }: { where: { id: string } }) => lots[where.id] ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          lotCreates.push(data);
          const id = `lot-new-${lotCreates.length}`;
          const row: LotRow = {
            id,
            warehouseId: data.warehouseId as string,
            categoryId: data.categoryId as string,
            catalogItemId: data.catalogItemId as string,
            productName: data.productName as string,
            quantityReceived: data.quantityReceived as number,
            quantityOnHand: data.quantityOnHand as number,
            incomingRelocation: data.incomingRelocation as boolean,
            status: data.status as string,
            specifications: {},
            specDefinedAt: null,
          };
          lots[id] = row;
          return row;
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const lot = lots[where.id];
          if (!lot) {
            return lot;
          }
          if (data.incomingRelocation === false) {
            lot.incomingRelocation = false;
          }
          const received = data.quantityReceived as
            | { increment?: number; decrement?: number }
            | undefined;
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
          if (data.specifications) {
            lot.specifications = data.specifications;
            lot.status = 'spremno_za_izdavanje';
          }
          if (data.status === 'zatvoreno') {
            lot.status = 'zatvoreno';
          }
          return lot;
        },
      },
      equipment: {
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { stockLotId?: string; catalogItemId?: string | null };
        }) => {
          equipmentUpdates.push({ where, data });
          const row = equipment[where.id];
          if (row) {
            if (data.stockLotId !== undefined) {
              row.stockLotId = data.stockLotId;
            }
            if (data.catalogItemId !== undefined) {
              row.catalogItemId = data.catalogItemId;
            }
          }
          return row;
        },
      },
    },
  };
};

describe('findOrCreateDestLotInTx', () => {
  it('returns existing open lot when catalog item matches', async () => {
    const lots: Record<string, LotRow> = {
      'lot-b': {
        id: 'lot-b',
        warehouseId: 'wh-b',
        categoryId: 'cat-leaf',
        catalogItemId: 'catalog-1',
        productName: 'Laptop',
        quantityReceived: 2,
        quantityOnHand: 1,
        incomingRelocation: false,
        status: 'spremno_za_izdavanje',
        specifications: { f1: 'x' },
        specDefinedAt: new Date(),
      },
    };
    const { tx, lotCreates } = createTx(lots, {});

    const result = await findOrCreateDestLotInTx(tx as never, {
      destWarehouseId: 'wh-b',
      categoryId: 'cat-leaf',
      catalogItemId: 'catalog-1',
      catalogItemName: 'Laptop',
      actorUserId: 'user-1',
    });

    assert.equal(result.id, 'lot-b');
    assert.equal(lotCreates.length, 0);
  });

  it('creates incoming relocation lot when none exists', async () => {
    const { tx, lotCreates } = createTx({}, {});

    const result = await findOrCreateDestLotInTx(tx as never, {
      destWarehouseId: 'wh-b',
      categoryId: 'cat-leaf',
      catalogItemId: 'catalog-1',
      catalogItemName: 'Laptop',
      actorUserId: 'user-1',
    });

    assert.equal(lotCreates.length, 1);
    assert.equal(result.warehouseId, 'wh-b');
    assert.equal(result.incomingRelocation, true);
    assert.equal(result.quantityReceived, 0);
  });
});

describe('applyCrossWarehouseIssueLotUpdatesInTx', () => {
  it('moves equipment stock lot and applies received deltas', async () => {
    const lots: Record<string, LotRow> = {
      'lot-a': {
        id: 'lot-a',
        warehouseId: 'wh-a',
        categoryId: 'cat-leaf',
        catalogItemId: 'catalog-1',
        productName: 'Laptop',
        quantityReceived: 5,
        quantityOnHand: 4,
        incomingRelocation: false,
        status: 'spremno_za_izdavanje',
        specifications: { field1: 'shared' },
        specDefinedAt: new Date(),
      },
    };
    const equipment: Record<string, EquipmentRow> = {
      'eq-1': { id: 'eq-1', stockLotId: 'lot-a', catalogItemId: 'catalog-1' },
    };
    const { tx } = createTx(lots, equipment);

    const result = await applyCrossWarehouseIssueLotUpdatesInTx(tx as never, {
      equipmentId: 'eq-1',
      sourceLotId: 'lot-a',
      sourceWarehouseId: 'wh-a',
      destWarehouseId: 'wh-b',
      categoryId: 'cat-leaf',
      catalogItemId: 'catalog-1',
      catalogItemName: 'Laptop',
      actorUserId: 'user-1',
      fields: [{ id: 'field1', label: 'Field', type: 'text', unique: false, required: true }],
      optionalFields: [],
    });

    assert.ok(result.destStockLotId.startsWith('lot-new-'));
    assert.equal(lots['lot-a'].quantityReceived, 4);
    assert.equal(lots[result.destStockLotId].quantityReceived, 1);
    assert.equal(lots[result.destStockLotId].quantityOnHand, 0);
    assert.equal(lots[result.destStockLotId].status, 'zatvoreno');
    assert.equal(equipment['eq-1'].stockLotId, result.destStockLotId);
  });

  it('rejects when catalog item is missing', async () => {
    const { tx } = createTx({}, {});

    await assert.rejects(
      () =>
        applyCrossWarehouseIssueLotUpdatesInTx(tx as never, {
          equipmentId: 'eq-1',
          sourceLotId: 'lot-a',
          sourceWarehouseId: 'wh-a',
          destWarehouseId: 'wh-b',
          categoryId: 'cat-leaf',
          catalogItemId: '',
          catalogItemName: 'Laptop',
          actorUserId: 'user-1',
          fields: [],
          optionalFields: [],
        }),
      (err: unknown) => err instanceof BadRequestException,
    );
  });
});
