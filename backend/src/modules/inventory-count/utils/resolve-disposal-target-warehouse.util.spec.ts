import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveDisposalTargetWarehouseId } from './resolve-disposal-target-warehouse.util';

describe('resolveDisposalTargetWarehouseId', () => {
  const noopDeps = {
    loadStockLotWarehouseId: async () => null,
    loadLastZaduzenjeFromWarehouseId: async () => null,
    resolveRegistrarWarehouseId: async () => null,
    resolveHolderWarehouseId: async () => null,
  };

  it('returns equipment warehouseId for skladiste', async () => {
    const actual = await resolveDisposalTargetWarehouseId(
      {
        equipmentId: 'eq-1',
        status: 'skladiste',
        warehouseId: 'wh-a',
        stockLotId: 'lot-1',
        currentHolderId: null,
      },
      noopDeps,
    );
    assert.equal(actual, 'wh-a');
  });

  it('uses stock lot warehouse for zaduzeno before registrar', async () => {
    const actual = await resolveDisposalTargetWarehouseId(
      {
        equipmentId: 'eq-1',
        status: 'zaduzeno',
        warehouseId: null,
        stockLotId: 'lot-1',
        currentHolderId: 'emp-1',
      },
      {
        ...noopDeps,
        loadStockLotWarehouseId: async (stockLotId) => (stockLotId === 'lot-1' ? 'wh-lot' : null),
        resolveRegistrarWarehouseId: async () => 'wh-registrar',
      },
    );
    assert.equal(actual, 'wh-lot');
  });

  it('falls back to registrar when lot has no warehouse', async () => {
    const actual = await resolveDisposalTargetWarehouseId(
      {
        equipmentId: 'eq-1',
        status: 'zaduzeno',
        warehouseId: null,
        stockLotId: 'lot-1',
        currentHolderId: null,
      },
      {
        ...noopDeps,
        resolveRegistrarWarehouseId: async () => 'wh-registrar',
      },
    );
    assert.equal(actual, 'wh-registrar');
  });

  it('falls back to last zaduzenje transfer warehouse', async () => {
    const actual = await resolveDisposalTargetWarehouseId(
      {
        equipmentId: 'eq-1',
        status: 'zaduzeno',
        warehouseId: null,
        stockLotId: null,
        currentHolderId: null,
      },
      {
        ...noopDeps,
        loadLastZaduzenjeFromWarehouseId: async (equipmentId) =>
          equipmentId === 'eq-1' ? 'wh-transfer' : null,
      },
    );
    assert.equal(actual, 'wh-transfer');
  });

  it('falls back to holder org warehouse', async () => {
    const actual = await resolveDisposalTargetWarehouseId(
      {
        equipmentId: 'eq-1',
        status: 'zaduzeno',
        warehouseId: null,
        stockLotId: null,
        currentHolderId: 'emp-1',
      },
      {
        ...noopDeps,
        resolveHolderWarehouseId: async (employeeId) => (employeeId === 'emp-1' ? 'wh-holder' : null),
      },
    );
    assert.equal(actual, 'wh-holder');
  });
});
