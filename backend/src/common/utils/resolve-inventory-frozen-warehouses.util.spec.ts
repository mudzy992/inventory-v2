import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  findFreezeContextForEquipment,
  findFreezeContextForWarehouse,
  type InventoryFreezeContext,
} from './resolve-inventory-frozen-warehouses.util';

const activeFreeze: InventoryFreezeContext = {
  sessionId: 'session-1',
  sessionName: 'POPIS 2026',
  warehouseId: 'wh-zenica',
  warehouseName: 'Skladište ED Zenica',
  reason: 'active_session',
};

describe('resolve-inventory-frozen-warehouses.util', () => {
  it('freezes zaduzeno equipment by holder effective warehouse', async () => {
    const actual = await findFreezeContextForEquipment(
      { status: 'zaduzeno', warehouseId: null, currentHolderId: 'emp-maglaj' },
      {
        resolveEquipmentWarehouseId: async () => 'wh-zenica',
        findActiveFreezeForWarehouse: async (warehouseId) =>
          warehouseId === 'wh-zenica' ? activeFreeze : null,
        findProductionFreezeForWarehouse: async () => null,
      },
    );
    assert.deepEqual(actual, activeFreeze);
  });

  it('allows equipment when warehouse is not frozen', async () => {
    const actual = await findFreezeContextForEquipment(
      { status: 'zaduzeno', warehouseId: null, currentHolderId: 'emp-sarajevo' },
      {
        resolveEquipmentWarehouseId: async () => 'wh-sarajevo',
        findActiveFreezeForWarehouse: async () => null,
        findProductionFreezeForWarehouse: async () => null,
      },
    );
    assert.equal(actual, null);
  });

  it('falls back to production lock when no active session freeze', async () => {
    const productionFreeze: InventoryFreezeContext = {
      ...activeFreeze,
      reason: 'production_lock',
    };
    const actual = await findFreezeContextForWarehouse('wh-zenica', {
      findActiveFreezeForWarehouse: async () => null,
      findProductionFreezeForWarehouse: async () => productionFreeze,
    });
    assert.equal(actual?.reason, 'production_lock');
  });
});
