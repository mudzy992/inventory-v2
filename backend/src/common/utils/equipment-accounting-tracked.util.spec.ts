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
    expect(normalizeInventoryNumber('')).toBeNull();
    expect(normalizeInventoryNumber('  ')).toBeNull();
    expect(normalizeInventoryNumber('INV-1')).toBe('INV-1');
  });

  it('detects accounting-tracked equipment', () => {
    expect(
      isAccountingTrackedEquipment({ isAccountingTracked: true, inventoryNumber: 'INV-1' }),
    ).toBe(true);
    expect(
      isAccountingTrackedEquipment({ isAccountingTracked: false, inventoryNumber: null }),
    ).toBe(false);
    expect(
      requiresTransferDocument({ isAccountingTracked: true, inventoryNumber: null }),
    ).toBe(false);
  });

  it('resolves issue fields with defaults', () => {
    expect(resolveIssueAccountingFields({ inventoryNumber: ' INV-1 ' })).toEqual({
      isAccountingTracked: true,
      inventoryNumber: 'INV-1',
    });
    expect(resolveIssueAccountingFields({ isAccountingTracked: false })).toEqual({
      isAccountingTracked: false,
      inventoryNumber: null,
    });
  });

  it('asserts tracked and untracked invariants', () => {
    expect(() =>
      assertEquipmentAccountingFields({ isAccountingTracked: true, inventoryNumber: null }),
    ).toThrow();
    expect(() =>
      assertEquipmentAccountingFields({ isAccountingTracked: false, inventoryNumber: 'INV-1' }),
    ).toThrow();
    expect(() =>
      assertEquipmentAccountingFields({ isAccountingTracked: true, inventoryNumber: 'INV-1' }),
    ).not.toThrow();
  });

  it('blocks downgrade and allows upgrade', () => {
    expect(() =>
      assertEquipmentAccountingUpgrade({
        existing: { isAccountingTracked: true, inventoryNumber: 'INV-1' },
        next: { isAccountingTracked: false, inventoryNumber: null },
      }),
    ).toThrow();
    expect(() =>
      assertEquipmentAccountingUpgrade({
        existing: { isAccountingTracked: false, inventoryNumber: null },
        next: { isAccountingTracked: true, inventoryNumber: 'INV-2' },
      }),
    ).not.toThrow();
  });
});
