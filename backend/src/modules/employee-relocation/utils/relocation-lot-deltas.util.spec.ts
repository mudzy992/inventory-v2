import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveDestAcceptLotDeltas } from './relocation-lot-accounting.util';

describe('resolveDestAcceptLotDeltas', () => {
  it('keeps dest onHand at 0 when equipment is zaduzeno', () => {
    assert.deepEqual(resolveDestAcceptLotDeltas('zaduzeno'), {
      destOnHandDelta: 0,
      destReceivedDelta: 1,
      sourceReceivedDelta: -1,
    });
  });

  it('increments dest onHand when equipment is on warehouse', () => {
    assert.deepEqual(resolveDestAcceptLotDeltas('skladiste'), {
      destOnHandDelta: 1,
      destReceivedDelta: 1,
      sourceReceivedDelta: -1,
    });
  });

  it('always decrements source received by 1', () => {
    assert.equal(resolveDestAcceptLotDeltas('zaduzeno').sourceReceivedDelta, -1);
    assert.equal(resolveDestAcceptLotDeltas('skladiste').sourceReceivedDelta, -1);
  });
});
