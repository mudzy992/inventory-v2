import assert from 'node:assert/strict';
import test from 'node:test';
import { isRelocationAlreadyApplied } from './is-relocation-already-applied.util';

test('recognizes a direct relocation to the target warehouse after an ambiguous commit', () => {
  assert.equal(
    isRelocationAlreadyApplied({
      kind: 'relocate_to_warehouse',
      targetWarehouseId: 'warehouse-1',
      equipment: {
        status: 'skladiste',
        warehouseId: 'warehouse-1',
        currentHolderId: null,
      },
    }),
    true,
  );
  assert.equal(
    isRelocationAlreadyApplied({
      kind: 'relocate_to_warehouse',
      targetWarehouseId: 'warehouse-1',
      equipment: {
        status: 'skladiste',
        warehouseId: 'warehouse-2',
        currentHolderId: null,
      },
    }),
    false,
  );
});

test('recognizes a direct relocation to the target person after an ambiguous commit', () => {
  assert.equal(
    isRelocationAlreadyApplied({
      kind: 'relocate_to_person',
      targetPersonId: 'person-1',
      equipment: {
        status: 'zaduzeno',
        warehouseId: null,
        currentHolderId: 'person-1',
      },
    }),
    true,
  );
  assert.equal(
    isRelocationAlreadyApplied({
      kind: 'relocate_to_person',
      targetPersonId: 'person-1',
      equipment: {
        status: 'zaduzeno',
        warehouseId: null,
        currentHolderId: 'person-2',
      },
    }),
    false,
  );
});
