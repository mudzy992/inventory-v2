import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isEquipmentEligibleForDisposalMark } from './assert-disposal-warehouse-eligibility.util';

describe('assert-disposal-warehouse-eligibility.util', () => {
  it('rejects zaduzeno equipment', () => {
    assert.equal(
      isEquipmentEligibleForDisposalMark({ status: 'zaduzeno', warehouseId: 'wh-1' }),
      false,
    );
  });

  it('rejects skladiste without warehouseId', () => {
    assert.equal(
      isEquipmentEligibleForDisposalMark({ status: 'skladiste', warehouseId: null }),
      false,
    );
  });

  it('allows skladiste with warehouseId', () => {
    assert.equal(
      isEquipmentEligibleForDisposalMark({ status: 'skladiste', warehouseId: 'wh-1' }),
      true,
    );
  });
});
