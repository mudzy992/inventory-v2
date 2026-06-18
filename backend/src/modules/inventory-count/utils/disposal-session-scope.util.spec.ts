import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CommitteeScopeDeps } from './resolve-warehouse-committee-scope.util';
import { isEquipmentInDisposalSessionScope } from './disposal-session-scope.util';

const scope = {
  sessionOrgUnitId: 'session-ou',
  warehouseId: 'wh-1',
  parentCategoryId: 'cat-parent',
};

const buildDeps = (overrides: Partial<CommitteeScopeDeps> = {}): CommitteeScopeDeps => ({
  expandCategoryIds: async () => new Set(['cat-leaf']),
  resolveEquipmentCityId: async () => 'city-1',
  getEffectiveLocationForOrgUnit: async () => 'city-1',
  getWarehouseCityId: async () => 'city-1',
  expandOrgUnitIds: async () => ['ou-holder'],
  getWarehouseOrgUnitId: async () => 'wh-ou',
  resolveEmployeeWarehouseId: async (employeeId) => (employeeId === 'emp-1' ? 'wh-1' : null),
  ...overrides,
});

describe('disposal-session-scope.util', () => {
  it('allows zaduzeno equipment when holder effective warehouse matches committee warehouse', async () => {
    const actual = await isEquipmentInDisposalSessionScope(
      buildDeps(),
      scope,
      {
        id: 'eq-1',
        categoryId: 'cat-leaf',
        status: 'zaduzeno',
        warehouseId: null,
        currentHolder: { id: 'emp-1', orgUnitId: 'ou-holder' },
        category: { categoryKind: 'ASSET' },
      },
    );
    assert.equal(actual, true);
  });

  it('rejects zaduzeno equipment when holder effective warehouse differs', async () => {
    const actual = await isEquipmentInDisposalSessionScope(
      buildDeps(),
      scope,
      {
        id: 'eq-1',
        categoryId: 'cat-leaf',
        status: 'zaduzeno',
        warehouseId: null,
        currentHolder: { id: 'emp-other', orgUnitId: 'ou-holder' },
        category: { categoryKind: 'ASSET' },
      },
    );
    assert.equal(actual, false);
  });

  it('requires skladiste equipment to match committee warehouse', async () => {
    const inScope = await isEquipmentInDisposalSessionScope(
      buildDeps(),
      scope,
      {
        id: 'eq-2',
        categoryId: 'cat-leaf',
        status: 'skladiste',
        warehouseId: 'wh-1',
        currentHolder: null,
        warehouse: { cityId: 'city-1' },
        category: { categoryKind: 'ASSET' },
      },
    );
    const outOfScope = await isEquipmentInDisposalSessionScope(
      buildDeps(),
      scope,
      {
        id: 'eq-3',
        categoryId: 'cat-leaf',
        status: 'skladiste',
        warehouseId: 'wh-other',
        currentHolder: null,
        warehouse: { cityId: 'city-1' },
        category: { categoryKind: 'ASSET' },
      },
    );
    assert.equal(inScope, true);
    assert.equal(outOfScope, false);
  });

  it('allows holder when effective warehouse matches even if location city differs', async () => {
    const actual = await isEquipmentInDisposalSessionScope(
      buildDeps({
        resolveEquipmentCityId: async () => 'city-maglaj',
        getWarehouseCityId: async () => 'city-zenica',
      }),
      scope,
      {
        id: 'eq-maglaj',
        categoryId: 'cat-leaf',
        status: 'zaduzeno',
        warehouseId: null,
        currentHolder: { id: 'emp-1', orgUnitId: 'ou-maglaj' },
        category: { categoryKind: 'ASSET' },
      },
    );
    assert.equal(actual, true);
  });
});
