import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateEquipmentInCommitteeScope,
  matchesWarehouseEquipmentScope,
  type CommitteeScopeDeps,
} from './resolve-warehouse-committee-scope.util';

const baseEquipment = {
  id: 'eq-1',
  categoryId: 'cat-leaf',
  category: { categoryKind: 'ASSET' as const },
};

const warehouseCommittee = {
  categoryId: 'cat-parent',
  warehouseId: 'wh-zenica',
  sessionOrgUnitId: 'session-ou',
};

const legacyCommittee = {
  categoryId: 'cat-parent',
  warehouseId: null,
  sessionOrgUnitId: 'session-ou',
};

const buildDeps = (overrides: Partial<CommitteeScopeDeps> = {}): CommitteeScopeDeps => ({
  expandCategoryIds: async () => new Set(['cat-leaf']),
  resolveEquipmentCityId: async () => 'city-maglaj',
  getEffectiveLocationForOrgUnit: async () => 'city-zenica',
  getWarehouseCityId: async () => 'city-zenica',
  expandOrgUnitIds: async () => ['ou-ed-zenica', 'ou-maglaj'],
  getWarehouseOrgUnitId: async () => 'ou-ed-zenica',
  resolveEmployeeWarehouseId: async (employeeId) =>
    employeeId === 'emp-zenica' ? 'wh-zenica' : employeeId === 'emp-maglaj' ? 'wh-maglaj' : null,
  ...overrides,
});

describe('resolve-warehouse-committee-scope.util', () => {
  it('allows zaduzeno holder when effective warehouse matches committee warehouse', async () => {
    const actual = await evaluateEquipmentInCommitteeScope(
      buildDeps(),
      warehouseCommittee,
      {
        ...baseEquipment,
        status: 'zaduzeno',
        warehouseId: null,
        currentHolder: { id: 'emp-zenica', orgUnitId: 'ou-maglaj' },
      },
    );
    assert.equal(actual, true);
  });

  it('rejects zaduzeno holder when effective warehouse differs even if org unit is in shared subtree', async () => {
    const actual = await evaluateEquipmentInCommitteeScope(
      buildDeps(),
      warehouseCommittee,
      {
        ...baseEquipment,
        status: 'zaduzeno',
        warehouseId: null,
        currentHolder: { id: 'emp-maglaj', orgUnitId: 'ou-maglaj' },
      },
    );
    assert.equal(actual, false);
  });

  it('scopes warehouses independently when they share the same orgUnit root', async () => {
    const inWhA = await matchesWarehouseEquipmentScope(buildDeps(), 'wh-zenica', {
      ...baseEquipment,
      status: 'zaduzeno',
      warehouseId: null,
      currentHolder: { id: 'emp-zenica', orgUnitId: 'ou-ed-zenica' },
    });
    const inWhB = await matchesWarehouseEquipmentScope(buildDeps(), 'wh-maglaj', {
      ...baseEquipment,
      status: 'zaduzeno',
      warehouseId: null,
      currentHolder: { id: 'emp-maglaj', orgUnitId: 'ou-ed-zenica' },
    });
    assert.equal(inWhA, true);
    assert.equal(inWhB, true);
  });

  it('allows skladiste equipment on committee warehouse regardless of city', async () => {
    const actual = await evaluateEquipmentInCommitteeScope(
      buildDeps({
        resolveEquipmentCityId: async () => 'city-maglaj',
        getWarehouseCityId: async () => 'city-zenica',
      }),
      warehouseCommittee,
      {
        ...baseEquipment,
        status: 'skladiste',
        warehouseId: 'wh-zenica',
        currentHolder: null,
        warehouse: { cityId: 'city-zenica' },
      },
    );
    assert.equal(actual, true);
  });

  it('rejects skladiste equipment on a different warehouse', async () => {
    const actual = await evaluateEquipmentInCommitteeScope(
      buildDeps(),
      warehouseCommittee,
      {
        ...baseEquipment,
        status: 'skladiste',
        warehouseId: 'wh-central',
        currentHolder: null,
        warehouse: { cityId: 'city-central' },
      },
    );
    assert.equal(actual, false);
  });

  it('uses city-wide scope for legacy committees without warehouseId', async () => {
    const inScope = await evaluateEquipmentInCommitteeScope(
      buildDeps({
        resolveEquipmentCityId: async () => 'city-zenica',
        getEffectiveLocationForOrgUnit: async () => 'city-zenica',
      }),
      legacyCommittee,
      {
        ...baseEquipment,
        status: 'zaduzeno',
        warehouseId: null,
        currentHolder: { id: 'emp-zenica', orgUnitId: 'ou-maglaj' },
      },
    );
    const outOfScope = await evaluateEquipmentInCommitteeScope(
      buildDeps({
        resolveEquipmentCityId: async () => 'city-maglaj',
        getEffectiveLocationForOrgUnit: async () => 'city-zenica',
      }),
      legacyCommittee,
      {
        ...baseEquipment,
        status: 'zaduzeno',
        warehouseId: null,
        currentHolder: { id: 'emp-zenica', orgUnitId: 'ou-maglaj' },
      },
    );
    assert.equal(inScope, true);
    assert.equal(outOfScope, false);
  });

  it('rejects rashodovano equipment', async () => {
    const actual = await evaluateEquipmentInCommitteeScope(
      buildDeps(),
      warehouseCommittee,
      {
        ...baseEquipment,
        status: 'rashodovano',
        warehouseId: 'wh-zenica',
        currentHolder: null,
      },
    );
    assert.equal(actual, false);
  });
});
