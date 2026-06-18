import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateEquipmentInCommitteeScope,
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
  ...overrides,
});

describe('resolve-warehouse-committee-scope.util', () => {
  it('allows zaduzeno holder in warehouse coverage when location city differs from warehouse city', async () => {
    const actual = await evaluateEquipmentInCommitteeScope(
      buildDeps(),
      warehouseCommittee,
      {
        ...baseEquipment,
        status: 'zaduzeno',
        warehouseId: null,
        currentHolder: { orgUnitId: 'ou-maglaj' },
      },
    );
    assert.equal(actual, true);
  });

  it('rejects zaduzeno holder outside warehouse coverage', async () => {
    const actual = await evaluateEquipmentInCommitteeScope(
      buildDeps({
        expandOrgUnitIds: async () => ['ou-ed-zenica'],
      }),
      warehouseCommittee,
      {
        ...baseEquipment,
        status: 'zaduzeno',
        warehouseId: null,
        currentHolder: { orgUnitId: 'ou-sarajevo' },
      },
    );
    assert.equal(actual, false);
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
        currentHolder: { orgUnitId: 'ou-maglaj' },
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
        currentHolder: { orgUnitId: 'ou-maglaj' },
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
