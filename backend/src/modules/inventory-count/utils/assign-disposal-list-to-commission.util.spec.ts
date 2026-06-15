import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assignListedDisposalItemsToCommissionInTx } from './assign-disposal-list-to-commission.util';

describe('assignListedDisposalItemsToCommissionInTx', () => {
  it('creates pending approvals for listed skladiste equipment', async () => {
    const approvalCalls: unknown[] = [];
    const listUpdates: unknown[] = [];
    const tx = {
      equipmentDisposalListItem: {
        findMany: async () => [
          {
            id: 'list-1',
            equipmentId: 'eq-1',
            equipment: { id: 'eq-1', status: 'skladiste', inventoryNumber: 'INV-1' },
          },
        ],
        update: async (args: unknown) => {
          listUpdates.push(args);
          return {};
        },
      },
      disposalInventoryApproval: {
        upsert: async (args: unknown) => {
          approvalCalls.push(args);
          return { id: 'appr-1' };
        },
      },
    };

    const count = await assignListedDisposalItemsToCommissionInTx(tx as never, {
      sessionId: 'sess-1',
      warehouseId: 'wh-1',
      parentCategoryId: 'cat-parent',
      disposalCommissionId: 'comm-1',
    });

    assert.equal(count, 1);
    assert.equal(approvalCalls.length, 1);
    assert.equal(listUpdates.length, 1);
  });

  it('skips zaduzeno equipment still on holder', async () => {
    let approvalCalls = 0;
    const tx = {
      equipmentDisposalListItem: {
        findMany: async () => [
          {
            id: 'list-2',
            equipmentId: 'eq-2',
            equipment: { id: 'eq-2', status: 'zaduzeno', inventoryNumber: 'INV-2' },
          },
        ],
        update: async () => ({}),
      },
      disposalInventoryApproval: {
        upsert: async () => {
          approvalCalls += 1;
          return { id: 'appr-2' };
        },
      },
    };

    const count = await assignListedDisposalItemsToCommissionInTx(tx as never, {
      sessionId: 'sess-1',
      warehouseId: 'wh-1',
      parentCategoryId: 'cat-parent',
      disposalCommissionId: 'comm-1',
    });

    assert.equal(count, 0);
    assert.equal(approvalCalls, 0);
  });
});
