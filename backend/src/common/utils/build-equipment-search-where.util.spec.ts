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

  it('builds general search with spec match ids', () => {
    const where = buildEquipmentSearchWhere({
      search: 'laptop',
      specMatchEquipmentIds: ['eq-1', 'eq-2'],
    });
    assert.ok(where && 'OR' in where);
    const or = (where as { OR: unknown[] }).OR;
    assert.equal(or.length, 4);
    assert.deepEqual(or[3], { id: { in: ['eq-1', 'eq-2'] } });
  });

  it('builds category-bound text field OR clauses with spec match ids', () => {
    const where = buildEquipmentSearchWhere({
      search: 'Dell',
      categoryTextFieldIds: ['f1', 'f2'],
      specMatchEquipmentIds: ['eq-3'],
    });
    assert.ok(where && 'OR' in where);
    const or = (where as { OR: unknown[] }).OR;
    assert.equal(or.length, 6);
    assert.deepEqual(or[3], { id: { in: ['eq-3'] } });
  });
});

describe('collectCategoryTextFieldIds', () => {
  it('returns text, number and select fields', () => {
    const ids = collectCategoryTextFieldIds([
      { id: 'a', name: 'A', type: 'text', required: true, unique: false },
      { id: 'b', name: 'B', type: 'number', required: true, unique: false },
      { id: 'c', name: 'C', type: 'date', required: true, unique: false },
      { id: 'd', name: 'D', type: 'select', required: true, unique: false, options: ['x'] },
    ]);
    assert.deepEqual(ids, ['a', 'b', 'd']);
  });
});
