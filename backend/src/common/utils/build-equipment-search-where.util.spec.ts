import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildEquipmentSearchWhere,
  collectCategoryTextFieldIds,
} from './build-equipment-search-where.util';

describe('buildEquipmentSearchWhere', () => {
  it('returns null when no search params', () => {
    assert.equal(buildEquipmentSearchWhere({}), null);
  });

  it('builds exact spec field filter', () => {
    const where = buildEquipmentSearchWhere({
      specFieldId: 'field-uuid',
      specValue: 'SN-123',
    });
    assert.deepEqual(where, {
      specifications: {
        path: '$."field-uuid"',
        equals: 'SN-123',
      },
    });
  });

  it('builds general search with JSON string_contains', () => {
    const where = buildEquipmentSearchWhere({ search: 'laptop' });
    assert.ok(where && 'OR' in where);
    const or = (where as { OR: unknown[] }).OR;
    assert.equal(or.length, 4);
    assert.deepEqual(or[3], { specifications: { string_contains: 'laptop' } });
  });

  it('builds category-bound text field OR clauses', () => {
    const where = buildEquipmentSearchWhere({
      search: 'Dell',
      categoryTextFieldIds: ['f1', 'f2'],
    });
    assert.ok(where && 'OR' in where);
    const or = (where as { OR: unknown[] }).OR;
    assert.equal(or.length, 5);
  });
});

describe('collectCategoryTextFieldIds', () => {
  it('returns only text fields', () => {
    const ids = collectCategoryTextFieldIds([
      { id: 'a', name: 'A', type: 'text', required: true, unique: false },
      { id: 'b', name: 'B', type: 'number', required: true, unique: false },
    ]);
    assert.deepEqual(ids, ['a']);
  });
});
