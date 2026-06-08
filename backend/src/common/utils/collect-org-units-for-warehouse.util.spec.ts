import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectOrgUnitIdsForEffectiveWarehouse } from './collect-org-units-for-warehouse.util';

const orgUnits = [
  { id: 'direkcija', parentId: null },
  { id: 'ed-zenica', parentId: 'direkcija' },
  { id: 'sluzba-ed', parentId: 'ed-zenica' },
  { id: 'sluzba-dir', parentId: 'direkcija' },
];

const warehouses = [
  {
    id: 'wh-central',
    orgUnitId: 'direkcija',
    cityId: 'city-sarajevo',
    isActive: true,
    createdAt: '2024-01-01',
  },
  {
    id: 'wh-ed',
    orgUnitId: 'ed-zenica',
    cityId: 'city-zenica',
    isActive: true,
    createdAt: '2024-01-02',
  },
];

describe('collect-org-units-for-warehouse.util', () => {
  it('assigns ED subtree to ED warehouse, not central', () => {
    const edOrgIds = collectOrgUnitIdsForEffectiveWarehouse('wh-ed', orgUnits, warehouses);
    assert.ok(edOrgIds.has('ed-zenica'));
    assert.ok(edOrgIds.has('sluzba-ed'));
    assert.equal(edOrgIds.has('sluzba-dir'), false);
    assert.equal(edOrgIds.has('direkcija'), false);
  });

  it('assigns direct Direkcija subtree to central when no intermediate warehouse', () => {
    const centralOrgIds = collectOrgUnitIdsForEffectiveWarehouse('wh-central', orgUnits, warehouses);
    assert.ok(centralOrgIds.has('direkcija'));
    assert.ok(centralOrgIds.has('sluzba-dir'));
    assert.equal(centralOrgIds.has('ed-zenica'), false);
    assert.equal(centralOrgIds.has('sluzba-ed'), false);
  });
});
