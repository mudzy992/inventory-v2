import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inheritDestLotSpecificationsInTx } from './utils/inherit-dest-lot-specifications.util';
import type { CategoryFieldDefinition } from '../../common/utils/category-fields.util';

type LotRow = {
  id: string;
  warehouseId: string;
  catalogItemId: string | null;
  specifications: Record<string, string>;
  status: string;
  specDefinedAt: Date | null;
};

const fields: CategoryFieldDefinition[] = [];
const optionalFields: CategoryFieldDefinition[] = [
  { id: 'ram', name: 'RAM', type: 'text', required: true, unique: false },
];

const createTx = (lots: Record<string, LotRow>) => {
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  return {
    updates,
    tx: {
      warehouseStockLot: {
        findUnique: async ({ where }: { where: { id: string } }) => lots[where.id] ?? null,
        findMany: async ({
          where,
        }: {
          where: {
            warehouseId: string;
            catalogItemId: string;
            status: string;
            id: { not: string };
          };
        }) =>
          Object.values(lots).filter(
            (lot) =>
              lot.warehouseId === where.warehouseId &&
              lot.catalogItemId === where.catalogItemId &&
              lot.status === where.status &&
              lot.id !== where.id.not,
          ),
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push({ id: where.id, data });
          const lot = lots[where.id];
          if (!lot) {
            return lot;
          }
          if (data.specifications) {
            lot.specifications = data.specifications as Record<string, string>;
          }
          if (data.status) {
            lot.status = data.status as string;
          }
          return lot;
        },
      },
    },
  };
};

describe('inheritDestLotSpecificationsInTx', () => {
  it('inherits from source lot when dest is empty', async () => {
    const lots: Record<string, LotRow> = {
      'lot-a': {
        id: 'lot-a',
        warehouseId: 'wh-a',
        catalogItemId: 'cat-1',
        specifications: { ram: '16GB' },
        status: 'spremno_za_izdavanje',
        specDefinedAt: new Date(),
      },
      'lot-b': {
        id: 'lot-b',
        warehouseId: 'wh-b',
        catalogItemId: 'cat-1',
        specifications: {},
        status: 'ceka_specifikaciju',
        specDefinedAt: null,
      },
    };
    const { tx } = createTx(lots);

    const result = await inheritDestLotSpecificationsInTx(tx as never, {
      destLotId: 'lot-b',
      sourceStockLotId: 'lot-a',
      destWarehouseId: 'wh-b',
      catalogItemId: 'cat-1',
      categoryId: 'category-1',
      fields,
      optionalFields,
      actorUserId: 'admin-1',
    });

    assert.equal(result.inherited, true);
    assert.equal(result.source, 'source_lot');
    assert.equal(lots['lot-b'].specifications.ram, '16GB');
    assert.equal(lots['lot-b'].status, 'spremno_za_izdavanje');
  });

  it('falls back to existing dest lot with same catalog item', async () => {
    const lots: Record<string, LotRow> = {
      'lot-existing': {
        id: 'lot-existing',
        warehouseId: 'wh-b',
        catalogItemId: 'cat-1',
        specifications: { ram: '32GB' },
        status: 'spremno_za_izdavanje',
        specDefinedAt: new Date(),
      },
      'lot-incoming': {
        id: 'lot-incoming',
        warehouseId: 'wh-b',
        catalogItemId: 'cat-1',
        specifications: {},
        status: 'ceka_specifikaciju',
        specDefinedAt: null,
      },
    };
    const { tx } = createTx(lots);

    const result = await inheritDestLotSpecificationsInTx(tx as never, {
      destLotId: 'lot-incoming',
      sourceStockLotId: null,
      destWarehouseId: 'wh-b',
      catalogItemId: 'cat-1',
      categoryId: 'category-1',
      fields,
      optionalFields,
      actorUserId: 'admin-1',
    });

    assert.equal(result.inherited, true);
    assert.equal(result.source, 'dest_existing');
    assert.equal(lots['lot-incoming'].specifications.ram, '32GB');
  });

  it('skips when dest lot already has specifications', async () => {
    const lots: Record<string, LotRow> = {
      'lot-b': {
        id: 'lot-b',
        warehouseId: 'wh-b',
        catalogItemId: 'cat-1',
        specifications: { ram: '8GB' },
        status: 'spremno_za_izdavanje',
        specDefinedAt: new Date(),
      },
    };
    const { tx, updates } = createTx(lots);

    const result = await inheritDestLotSpecificationsInTx(tx as never, {
      destLotId: 'lot-b',
      sourceStockLotId: 'lot-a',
      destWarehouseId: 'wh-b',
      catalogItemId: 'cat-1',
      categoryId: 'category-1',
      fields,
      optionalFields,
      actorUserId: 'admin-1',
    });

    assert.equal(result.inherited, false);
    assert.equal(updates.length, 0);
  });

  it('skips when no source or dest candidate has specs', async () => {
    const lots: Record<string, LotRow> = {
      'lot-a': {
        id: 'lot-a',
        warehouseId: 'wh-a',
        catalogItemId: 'cat-1',
        specifications: {},
        status: 'ceka_specifikaciju',
        specDefinedAt: null,
      },
      'lot-b': {
        id: 'lot-b',
        warehouseId: 'wh-b',
        catalogItemId: 'cat-1',
        specifications: {},
        status: 'ceka_specifikaciju',
        specDefinedAt: null,
      },
    };
    const { tx, updates } = createTx(lots);

    const result = await inheritDestLotSpecificationsInTx(tx as never, {
      destLotId: 'lot-b',
      sourceStockLotId: 'lot-a',
      destWarehouseId: 'wh-b',
      catalogItemId: 'cat-1',
      categoryId: 'category-1',
      fields,
      optionalFields,
      actorUserId: 'admin-1',
    });

    assert.equal(result.inherited, false);
    assert.equal(updates.length, 0);
  });
});
