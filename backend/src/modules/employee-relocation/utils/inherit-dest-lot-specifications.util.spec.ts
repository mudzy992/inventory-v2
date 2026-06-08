import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isLotSpecificationsEmpty,
  parseLotSpecifications,
  resolveInheritedLotSpecifications,
} from './inherit-dest-lot-specifications.util';
import type { CategoryFieldDefinition } from '../../../common/utils/category-fields.util';

const lotFields: CategoryFieldDefinition[] = [
  { id: 'ram', name: 'RAM', type: 'text', required: true, unique: false },
];

describe('parseLotSpecifications', () => {
  it('parses string map from JSON object', () => {
    assert.deepEqual(parseLotSpecifications({ ram: '16GB', serial: 'ABC' }), {
      ram: '16GB',
      serial: 'ABC',
    });
  });

  it('returns empty object for invalid values', () => {
    assert.deepEqual(parseLotSpecifications(null), {});
  });
});

describe('isLotSpecificationsEmpty', () => {
  it('returns true when lot fields are empty', () => {
    assert.equal(isLotSpecificationsEmpty({ ram: '', serial: 'x' }, lotFields), true);
  });

  it('returns false when a lot field has value', () => {
    assert.equal(isLotSpecificationsEmpty({ ram: '8GB' }, lotFields), false);
  });
});

describe('resolveInheritedLotSpecifications', () => {
  it('prefers source lot over dest existing', () => {
    const resolved = resolveInheritedLotSpecifications(
      { specifications: { ram: '16GB' }, status: 'spremno_za_izdavanje' },
      { specifications: { ram: '8GB' }, status: 'spremno_za_izdavanje' },
      lotFields,
    );
    assert.equal(resolved?.source, 'source_lot');
    assert.equal(resolved?.specs.ram, '16GB');
  });

  it('falls back to dest existing when source is empty', () => {
    const resolved = resolveInheritedLotSpecifications(
      { specifications: {}, status: 'ceka_specifikaciju' },
      { specifications: { ram: '8GB' }, status: 'spremno_za_izdavanje' },
      lotFields,
    );
    assert.equal(resolved?.source, 'dest_existing');
  });

  it('returns null when no candidate has lot spec', () => {
    assert.equal(
      resolveInheritedLotSpecifications(
        { specifications: {}, status: 'ceka_specifikaciju' },
        { specifications: {}, status: 'ceka_specifikaciju' },
        lotFields,
      ),
      null,
    );
  });
});
