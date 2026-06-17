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
  ...overrides,
});

describe('disposal-session-scope.util', () => {
  it('allows zaduzeno equipment when holder is in warehouse coverage', async () => {
    const actual = await isEquipmentInDisposalSessionScope(
      buildDeps(),
      scope,
      {
        id: 'eq-1',
        categoryId: 'cat-leaf',
        status: 'zaduzeno',
        warehouseId: null,
        currentHolder: { orgUnitId: 'ou-holder' },
        category: { categoryKind: 'ASSET' },
      },
    );
    assert.equal(actual, true);
  });

  it('rejects zaduzeno equipment when holder is outside warehouse coverage', async () => {
    const actual = await isEquipmentInDisposalSessionScope(
      buildDeps({
        expandOrgUnitIds: async () => ['ou-other'],
      }),
      scope,
      {
        id: 'eq-1',
        categoryId: 'cat-leaf',
        status: 'zaduzeno',
        warehouseId: null,
        currentHolder: { orgUnitId: 'ou-holder' },
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
});
