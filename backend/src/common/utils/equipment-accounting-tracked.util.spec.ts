import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertEquipmentAccountingFields,
  assertEquipmentAccountingUpgrade,
  isAccountingTrackedEquipment,
  normalizeInventoryNumber,
  requiresTransferDocument,
  resolveIssueAccountingFields,
} from './equipment-accounting-tracked.util';

describe('equipment-accounting-tracked.util', () => {
  it('normalizes empty inventory number to null', () => {
    assert.equal(normalizeInventoryNumber(''), null);
    assert.equal(normalizeInventoryNumber('  '), null);
    assert.equal(normalizeInventoryNumber('INV-1'), 'INV-1');
  });

  it('detects accounting-tracked equipment', () => {
    assert.equal(
      isAccountingTrackedEquipment({ isAccountingTracked: true, inventoryNumber: 'INV-1' }),
      true,
    );
    assert.equal(
      isAccountingTrackedEquipment({ isAccountingTracked: false, inventoryNumber: null }),
      false,
    );
    assert.equal(
      requiresTransferDocument({ isAccountingTracked: true, inventoryNumber: null }),
      false,
    );
  });

  it('resolves issue fields with defaults', () => {
    assert.deepEqual(resolveIssueAccountingFields({ inventoryNumber: ' INV-1 ' }), {
      isAccountingTracked: true,
      inventoryNumber: 'INV-1',
    });
    assert.deepEqual(resolveIssueAccountingFields({ isAccountingTracked: false }), {
      isAccountingTracked: false,
      inventoryNumber: null,
    });
  });

  it('asserts tracked and untracked invariants', () => {
    assert.throws(() =>
      assertEquipmentAccountingFields({ isAccountingTracked: true, inventoryNumber: null }),
    );
    assert.throws(() =>
      assertEquipmentAccountingFields({ isAccountingTracked: false, inventoryNumber: 'INV-1' }),
    );
    assert.doesNotThrow(() =>
      assertEquipmentAccountingFields({ isAccountingTracked: true, inventoryNumber: 'INV-1' }),
    );
  });

  it('blocks downgrade and allows upgrade', () => {
    assert.throws(() =>
      assertEquipmentAccountingUpgrade({
        existing: { isAccountingTracked: true, inventoryNumber: 'INV-1' },
        next: { isAccountingTracked: false, inventoryNumber: null },
      }),
    );
    assert.doesNotThrow(() =>
      assertEquipmentAccountingUpgrade({
        existing: { isAccountingTracked: false, inventoryNumber: null },
        next: { isAccountingTracked: true, inventoryNumber: 'INV-2' },
      }),
    );
  });
});
