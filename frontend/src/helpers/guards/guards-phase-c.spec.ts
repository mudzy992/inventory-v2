import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canDeleteEmployee } from './employee-guards';
import { canDeleteCatalogItem } from './equipment-catalog-guards';
import {
  canCreateTransferType,
  TRANSFER_GUARD_MESSAGES,
} from './transfer-guards';
import { canEditLotSpecifications } from './warehouse-stock-guards';
import { canTransferRelocationLine } from './employee-relocation-guards';
import { canMarkDisposalList, DISPOSAL_GUARD_MESSAGES } from './disposal-guards';
import { getScopedCategoryIds } from '../registrar-scope';
import { getOrgTreeRootUnits } from '../org-hierarchy.util';
import type { Category, UserAccount } from '../../types';

describe('Phase C guard smoke — FE helpers', () => {
  it('employees: blocks delete when hasUserAccount', () => {
    const result = canDeleteEmployee({
      employeeId: 'e1',
      hasUserAccount: true,
      isOrgSigner: false,
      signedTransferCount: 0,
      heldEquipmentCount: 0,
      openRelocationCount: 0,
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason ?? '', /korisnički račun/i);
  });

  it('catalog: blocks delete when inUseCount > 0', () => {
    const result = canDeleteCatalogItem(3);
    assert.equal(result.allowed, false);
    assert.match(result.reason ?? '', /u upotrebi/i);
  });

  it('transfers: rashodovanje always blocked', () => {
    const result = canCreateTransferType('rashodovanje', { 'features.transfers': true });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, TRANSFER_GUARD_MESSAGES.rashodovanjeBlocked);
  });

  it('transfers: blocked when module disabled', () => {
    const result = canCreateTransferType('zaduzenje', { 'features.transfers': false });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, TRANSFER_GUARD_MESSAGES.transfersDisabled);
  });

  it('registrar stock: blocks spec edit on zatvoreno lot', () => {
    const result = canEditLotSpecifications('zatvoreno');
    assert.equal(result.allowed, false);
    assert.match(result.reason ?? '', /zatvoren/i);
  });

  it('relocation: blocks transfer without catalog', () => {
    const result = canTransferRelocationLine({
      catalogItemId: null,
      effectiveCatalogItemId: null,
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason ?? '', /šifrarnik/i);
  });

  it('disposal: allows mark when equipment is on warehouse', () => {
    const result = canMarkDisposalList({
      sessionStatus: 'draft',
      equipmentStatus: 'skladiste',
      warehouseId: 'wh-1',
    });
    assert.equal(result.allowed, true);
  });

  it('disposal: blocks mark for zaduzeno equipment', () => {
    const result = canMarkDisposalList({
      sessionStatus: 'draft',
      equipmentStatus: 'zaduzeno',
      warehouseId: 'wh-1',
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, DISPOSAL_GUARD_MESSAGES.disposalRequiresWarehouse);
  });

  it('moderator: reads all categories for menus', () => {
    const categories: Category[] = [
      { id: 'p1', name: 'Parent', description: '', parentId: null, categoryKind: 'ASSET', fields: [], optionalFields: [] },
      { id: 'c1', name: 'Child', description: '', parentId: 'p1', categoryKind: 'ASSET', fields: [], optionalFields: [] },
    ];
    const moderator = { role: 'moderator' } as UserAccount;
    const scoped = getScopedCategoryIds(moderator, categories);
    assert.equal(scoped.size, 2);
  });

  it('org tree: scoped list uses forest roots', () => {
    const roots = getOrgTreeRootUnits([
      { id: 'podrucje-1', parentId: 'direkcija-1', type: 'podrucje', name: 'Područje' } as never,
      { id: 'ed-zenica', parentId: 'podrucje-1', type: 'podruznica', name: 'ED Zenica' } as never,
    ]);
    assert.equal(roots.length, 1);
    assert.equal(roots[0]?.id, 'podrucje-1');
  });
});
