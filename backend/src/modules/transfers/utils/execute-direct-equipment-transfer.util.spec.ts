import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { executeDirectEquipmentTransferInTx } from './execute-direct-equipment-transfer.util';

describe('execute-direct-equipment-transfer.util', () => {
  it('updates equipment holder for prenos', async () => {
    const updates: unknown[] = [];
    const tx = {
      equipment: {
        update: async (args: unknown) => {
          updates.push(args);
          return {};
        },
      },
    };
    await executeDirectEquipmentTransferInTx(tx as never, {
      equipmentId: 'eq-1',
      type: 'prenos',
      toPersonId: 'person-2',
    });
    assert.equal(updates.length, 1);
    const update = updates[0] as { where: { id: string }; data: { currentHolderId: string } };
    assert.equal(update.where.id, 'eq-1');
    assert.equal(update.data.currentHolderId, 'person-2');
  });
});
