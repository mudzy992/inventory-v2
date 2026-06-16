import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findCanonicalStockLotInTx } from './find-canonical-stock-lot.util';

type LotRow = {
  id: string;
  warehouseId: string;
  catalogItemId: string | null;
  lotKind: 'ISSUABLE' | 'MAINTENANCE';
  status: 'ceka_specifikaciju' | 'spremno_za_izdavanje' | 'zatvoreno';
  createdAt: Date;
};

const createTx = (lots: LotRow[]) => ({
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
        const matches = lots.filter((row) => {
          if (row.warehouseId !== where.warehouseId) return false;
          if (row.catalogItemId !== where.catalogItemId) return false;
          if (row.lotKind !== where.lotKind) return false;
          if (typeof where.status === 'string') return row.status === where.status;
          return row.status !== where.status.not;
        });
        matches.sort((a, b) =>
          orderBy.createdAt === 'asc'
            ? a.createdAt.getTime() - b.createdAt.getTime()
            : b.createdAt.getTime() - a.createdAt.getTime(),
        );
        return (matches[0] as unknown) ?? null;
      },
    },
  },
});

describe('findCanonicalStockLotInTx', () => {
  it('returns oldest open lot when present', async () => {
    const lots: LotRow[] = [
      {
        id: 'closed-1',
        warehouseId: 'w1',
        catalogItemId: 'c1',
        lotKind: 'ISSUABLE',
        status: 'zatvoreno',
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 'open-2',
        warehouseId: 'w1',
        catalogItemId: 'c1',
        lotKind: 'ISSUABLE',
        status: 'spremno_za_izdavanje',
        createdAt: new Date('2026-02-01'),
      },
      {
        id: 'open-1',
        warehouseId: 'w1',
        catalogItemId: 'c1',
        lotKind: 'ISSUABLE',
        status: 'ceka_specifikaciju',
        createdAt: new Date('2026-01-15'),
      },
    ];
    const { tx } = createTx(lots);
    const result = await findCanonicalStockLotInTx(tx as never, {
      warehouseId: 'w1',
      catalogItemId: 'c1',
    });
    assert.equal(result?.id, 'open-1');
  });

  it('falls back to most recent closed lot when no open lots exist', async () => {
    const lots: LotRow[] = [
      {
        id: 'closed-old',
        warehouseId: 'w1',
        catalogItemId: 'c1',
        lotKind: 'ISSUABLE',
        status: 'zatvoreno',
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 'closed-new',
        warehouseId: 'w1',
        catalogItemId: 'c1',
        lotKind: 'ISSUABLE',
        status: 'zatvoreno',
        createdAt: new Date('2026-02-01'),
      },
    ];
    const { tx } = createTx(lots);
    const result = await findCanonicalStockLotInTx(tx as never, {
      warehouseId: 'w1',
      catalogItemId: 'c1',
    });
    assert.equal(result?.id, 'closed-new');
  });
});

