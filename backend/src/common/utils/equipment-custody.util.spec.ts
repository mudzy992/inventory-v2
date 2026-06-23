import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCustodyUpdateOnTransferFinalize } from './equipment-custody.util';

describe('equipment-custody.util', () => {
  it('sets custody on razduzenje from holder org', () => {
    assert.deepEqual(
      buildCustodyUpdateOnTransferFinalize('razduzenje', 'ou-child'),
      { custodyOrgUnitId: 'ou-child' },
    );
  });

  it('clears custody on zaduzenje', () => {
    assert.deepEqual(buildCustodyUpdateOnTransferFinalize('zaduzenje'), {
      custodyOrgUnitId: null,
    });
  });

  it('leaves custody unchanged on prenos', () => {
    assert.deepEqual(buildCustodyUpdateOnTransferFinalize('prenos', 'ou-child'), {});
  });

  it('skips custody on razduzenje without org unit', () => {
    assert.deepEqual(buildCustodyUpdateOnTransferFinalize('razduzenje', null), {});
  });
});
