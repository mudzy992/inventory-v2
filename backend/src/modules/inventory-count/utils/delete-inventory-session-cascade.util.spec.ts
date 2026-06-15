import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deleteInventorySessionCascadeInTx } from './delete-inventory-session-cascade.util';

describe('deleteInventorySessionCascadeInTx', () => {
  it('reverts za_rashod equipment, unlinks list items, deletes commissions and session', async () => {
    const calls: string[] = [];
    const tx = {
      equipmentDisposalListItem: {
        findMany: async () => [{ equipmentId: 'eq-1' }],
        updateMany: async ({ data }: { data: { disposalCommissionId: null } }) => {
          calls.push(`list-update:${data.disposalCommissionId}`);
          return { count: 1 };
        },
      },
      equipment: {
        updateMany: async ({ where, data }: { where: { status: string }; data: { status: string } }) => {
          calls.push(`equipment:${where.status}->${data.status}`);
          return { count: 1 };
        },
      },
      inventoryCommittee: {
        findMany: async () => [{ disposalCommissionId: 'dc-1' }, { disposalCommissionId: 'dc-1' }],
      },
      disposalInventoryApproval: {
        deleteMany: async () => {
          calls.push('approvals-delete');
          return { count: 0 };
        },
      },
      disposalCommission: {
        deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
          calls.push(`commissions:${where.id.in.join(',')}`);
          return { count: 1 };
        },
      },
      inventorySession: {
        delete: async ({ where }: { where: { id: string } }) => {
          calls.push(`session:${where.id}`);
          return { id: where.id };
        },
      },
    };
    await deleteInventorySessionCascadeInTx({ tx: tx as never, sessionId: 'session-1' });
    assert.deepEqual(calls, [
      'equipment:za_rashod->skladiste',
      'list-update:null',
      'approvals-delete',
      'commissions:dc-1',
      'session:session-1',
    ]);
  });
});
