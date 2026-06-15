import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { provisionSessionCommitteeSlots } from './provision-session-committee-slots.util';

describe('provisionSessionCommitteeSlots', () => {
  const warehouses = [
    { id: 'w1', name: 'Skladište A', cityId: 'city-1' },
    { id: 'w2', name: 'Skladište B', cityId: 'city-1' },
  ];
  const categories = [
    { id: 'c1', name: 'IT' },
    { id: 'c2', name: 'Namještaj' },
  ];

  const buildTx = (existing: { warehouseId: string | null; categoryId: string }[] = []) => {
    const committees: unknown[] = [];
    const commissions: unknown[] = [];
    let commissionSeq = 0;
    return {
      committees,
      commissions,
      tx: {
        inventoryCommittee: {
          findMany: async () => existing,
          create: async ({ data }: { data: unknown }) => {
            committees.push(data);
            return data;
          },
        },
        disposalCommission: {
          create: async ({ data }: { data: { cityId: string; name: string } }) => {
            commissionSeq += 1;
            const row = { id: `dc-${commissionSeq}`, ...data };
            commissions.push(row);
            return row;
          },
        },
      },
    };
  };

  it('creates a slot for each warehouse x category pair', async () => {
    const fixture = buildTx();
    const result = await provisionSessionCommitteeSlots({
      tx: fixture.tx as never,
      sessionId: 'session-1',
      sessionName: 'POPIS 2026',
      warehouses,
      categories,
    });
    assert.deepEqual(result, { created: 4, skipped: 0 });
    assert.equal(fixture.committees.length, 4);
    assert.equal(fixture.commissions.length, 4);
  });

  it('is idempotent and skips existing pairs', async () => {
    const fixture = buildTx([{ warehouseId: 'w1', categoryId: 'c1' }]);
    const result = await provisionSessionCommitteeSlots({
      tx: fixture.tx as never,
      sessionId: 'session-1',
      sessionName: 'POPIS 2026',
      warehouses,
      categories,
    });
    assert.deepEqual(result, { created: 3, skipped: 1 });
    assert.equal(fixture.committees.length, 3);
  });
});
