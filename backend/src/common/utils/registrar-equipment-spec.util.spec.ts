import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getRegistrarLockedSpecFieldIds,
  isRegistrarLockedEquipmentSpecField,
  resolveRegistrarEquipmentSpecifications,
} from './registrar-equipment-spec.util';

const unitFields = [
  { id: 'sn', name: 'Serial', type: 'text' as const, required: true, unique: true },
  { id: 'owner', name: 'Owner', type: 'select' as const, required: true, unique: false, options: ['A', 'B'] },
];

const lotFields = [
  { id: 'brand', name: 'Brand', type: 'text' as const, required: true, unique: false },
];

describe('registrar-equipment-spec.util', () => {
  it('locks only unique unit fields', () => {
    assert.equal(isRegistrarLockedEquipmentSpecField(unitFields[0]), true);
    assert.equal(isRegistrarLockedEquipmentSpecField(unitFields[1]), false);
    assert.deepEqual(getRegistrarLockedSpecFieldIds(unitFields), new Set(['sn']));
  });

  it('allows registrar to change non-unique unit fields', () => {
    const actual = resolveRegistrarEquipmentSpecifications(
      { sn: 'SN-1', owner: 'A', brand: 'Dell' },
      { sn: 'SN-1', owner: 'B', brand: 'Dell' },
      unitFields,
      lotFields,
    );
    assert.equal(actual.owner, 'B');
    assert.equal(actual.sn, 'SN-1');
  });

  it('rejects registrar change to unique unit field', () => {
    assert.throws(
      () =>
        resolveRegistrarEquipmentSpecifications(
          { sn: 'SN-1', owner: 'A' },
          { sn: 'SN-2', owner: 'A' },
          unitFields,
          lotFields,
        ),
      /unikatno polje po komadu/i,
    );
  });
});
