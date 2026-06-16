import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCanonicalDestLotInTx } from './resolve-canonical-dest-lot.util';

type LotRow = {
  id: string;
  warehouseId: string;
  categoryId: string;
  catalogItemId: string | null;
  lotKind: 'ISSUABLE' | 'MAINTENANCE';
  productName: string;
  quantityReceived: number;
  quantityOnHand: number;
  incomingRelocation: boolean;
  status: 'ceka_specifikaciju' | 'spremno_za_izdavanje' | 'zatvoreno';
  specDefinedAt: Date | null;
  createdAt: Date;
  receivedByUserId: string;
  entryDate: Date;
};

const createTx = (lots: LotRow[]) => {
  const creates: unknown[] = [];
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  return {
    creates,
    updates,
    tx: {
      warehouseStockLot: {
        findFirst: async ({
          where,
          orderBy,
        }: {
          where: {
            warehouseId: string;
            catalogItemId: string;
            lotKind: 'ISSUABLE';
            status: { not?: 'zatvoreno' } | 'zatvoreno';
          };
          orderBy: { createdAt: 'asc' | 'desc' };
        }) => {
          const matches = lots
            .filter((row) => {
              if (row.warehouseId !== where.warehouseId) return false;
              if (row.catalogItemId !== where.catalogItemId) return false;
              if (row.lotKind !== where.lotKind) return false;
              if (typeof where.status === 'string') return row.status === where.status;
              return row.status !== where.status.not;
            })
            .sort((a, b) =>
              orderBy.createdAt === 'asc'
                ? a.createdAt.getTime() - b.createdAt.getTime()
                : b.createdAt.getTime() - a.createdAt.getTime(),
            );
          return (matches[0] as unknown) ?? null;
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          creates.push(data);
          const row: LotRow = {
            id: `lot-${creates.length}`,
            warehouseId: data.warehouseId as string,
            categoryId: data.categoryId as string,
            catalogItemId: data.catalogItemId as string,
            lotKind: 'ISSUABLE',
            productName: data.productName as string,
            quantityReceived: data.quantityReceived as number,
            quantityOnHand: data.quantityOnHand as number,
            incomingRelocation: data.incomingRelocation as boolean,
            status: data.status as LotRow['status'],
            specDefinedAt: null,
            createdAt: new Date(),
            receivedByUserId: data.receivedByUserId as string,
            entryDate: data.entryDate as Date,
          };
          lots.push(row);
          return row;
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          updates.push({ id: where.id, data });
          const row = lots.find((lot) => lot.id === where.id);
          if (!row) {
            return null;
          }
          if (data.status) {
            row.status = data.status as LotRow['status'];
          }
          if (data.incomingRelocation === true) {
            row.incomingRelocation = true;
          }
          return row;
        },
      },
    },
  };
};

const baseInput = {
  destWarehouseId: 'wh-b',
  categoryId: 'cat-1',
  catalogItemId: 'catalog-1',
  catalogItemName: 'Roba 1',
  actorUserId: 'user-1',
};

describe('resolveCanonicalDestLotInTx', () => {
  it('reuses open canonical lot without create', async () => {
    const lots: LotRow[] = [
      {
        id: 'lot-open',
        warehouseId: 'wh-b',
        categoryId: 'cat-1',
        catalogItemId: 'catalog-1',
        lotKind: 'ISSUABLE',
        productName: 'Roba 1',
        quantityReceived: 1,
        quantityOnHand: 0,
        incomingRelocation: false,
        status: 'spremno_za_izdavanje',
        specDefinedAt: new Date(),
        createdAt: new Date('2026-01-01'),
        receivedByUserId: 'user-1',
        entryDate: new Date('2026-01-01'),
      },
    ];
    const { tx, creates } = createTx(lots);
    const result = await resolveCanonicalDestLotInTx(tx as never, baseInput);
    assert.equal(result.lot.id, 'lot-open');
    assert.equal(result.created, false);
    assert.equal(result.reopened, false);
    assert.equal(creates.length, 0);
  });

  it('reopens closed canonical lot', async () => {
    const lots: LotRow[] = [
      {
        id: 'lot-closed',
        warehouseId: 'wh-b',
        categoryId: 'cat-1',
        catalogItemId: 'catalog-1',
        lotKind: 'ISSUABLE',
        productName: 'Roba 1',
        quantityReceived: 1,
        quantityOnHand: 0,
        incomingRelocation: false,
        status: 'zatvoreno',
        specDefinedAt: new Date(),
        createdAt: new Date('2026-01-01'),
        receivedByUserId: 'user-1',
        entryDate: new Date('2026-01-01'),
      },
    ];
    const { tx, creates, updates } = createTx(lots);
    const result = await resolveCanonicalDestLotInTx(tx as never, baseInput);
    assert.equal(result.lot.id, 'lot-closed');
    assert.equal(result.created, false);
    assert.equal(result.reopened, true);
    assert.equal(creates.length, 0);
    assert.equal(updates.length, 1);
    assert.equal(result.lot.status, 'spremno_za_izdavanje');
    assert.equal(result.lot.incomingRelocation, true);
  });

  it('creates lot when none exists', async () => {
    const { tx, creates } = createTx([]);
    const result = await resolveCanonicalDestLotInTx(tx as never, baseInput);
    assert.equal(result.created, true);
    assert.equal(result.reopened, false);
    assert.equal(creates.length, 1);
    assert.equal(result.lot.incomingRelocation, true);
    assert.equal(result.lot.quantityReceived, 0);
  });
});
