import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTransferEquipmentLabel } from './build-transfer-equipment-label.util';

describe('build-transfer-equipment-label.util', () => {
  it('returns lot name only when serial is missing', () => {
    const actual = buildTransferEquipmentLabel({
      category: {
        name: 'Laptop',
        fields: [{ id: 'f1', name: 'Serijski broj', type: 'text', required: false, unique: false }],
        optionalFields: [],
      },
      specifications: {},
      stockLot: { productName: 'ThinkPad T14' },
    });
    assert.equal(actual, 'ThinkPad T14');
  });

  it('appends serial number when present in specifications', () => {
    const actual = buildTransferEquipmentLabel({
      category: {
        name: 'Laptop',
        fields: [{ id: 'f1', name: 'Serijski broj', type: 'text', required: false, unique: false }],
        optionalFields: [],
      },
      specifications: { f1: 'SN-12345' },
      stockLot: { productName: 'ThinkPad T14' },
    });
    assert.equal(actual, 'ThinkPad T14 — SN-12345');
  });

  it('falls back to category name when lot is missing', () => {
    const actual = buildTransferEquipmentLabel({
      category: {
        name: 'Monitor',
        fields: [],
        optionalFields: [],
      },
      specifications: {},
      stockLot: null,
    });
    assert.equal(actual, 'Monitor');
  });
});
