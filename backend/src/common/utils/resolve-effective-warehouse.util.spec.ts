import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveEffectiveWarehouseId } from './resolve-effective-warehouse.util';

const orgUnits = [
  { id: 'ed', parentId: 'dist' },
  { id: 'pj', parentId: 'ed' },
  { id: 'odj', parentId: 'pj' },
  { id: 'dist', parentId: null },
];

describe('resolve-effective-warehouse.util', () => {
  it('inherits warehouse from ancestor regardless of city mismatch on child context', () => {
    const warehouses = [
      {
        id: 'wh-ed',
        orgUnitId: 'ed',
        cityId: 'city-sarajevo',
        isActive: true,
        createdAt: '2024-01-01',
      },
    ];
    const resolved = resolveEffectiveWarehouseId('pj', orgUnits, warehouses, 'city-zenica');
    assert.equal(resolved, 'wh-ed');
  });

  it('inherits for leaf org unit under poslovna_jedinica chain', () => {
    const warehouses = [
      {
        id: 'wh-ed',
        orgUnitId: 'ed',
        cityId: 'city-a',
        isActive: true,
        createdAt: '2024-01-01',
      },
    ];
    assert.equal(resolveEffectiveWarehouseId('odj', orgUnits, warehouses, 'city-b'), 'wh-ed');
  });

  it('uses city fallback only when ancestry chain has no org-bound warehouse', () => {
    const warehouses = [
      {
        id: 'wh-central',
        orgUnitId: null,
        cityId: 'city-zenica',
        isActive: true,
        createdAt: '2024-01-02',
      },
    ];
    assert.equal(resolveEffectiveWarehouseId('pj', orgUnits, warehouses, 'city-zenica'), 'wh-central');
    assert.equal(resolveEffectiveWarehouseId('pj', orgUnits, warehouses, null), null);
  });
});
