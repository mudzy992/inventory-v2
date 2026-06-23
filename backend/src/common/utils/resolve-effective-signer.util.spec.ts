import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveEffectiveSignerId } from './resolve-effective-signer.util';

describe('resolve-effective-signer.util', () => {
  const units = [
    { id: 'dir', parentId: null, signerId: 'emp-director' },
    { id: 'sector', parentId: 'dir', signerId: null },
    { id: 'service', parentId: 'sector', signerId: 'emp-service-head' },
    { id: 'dept', parentId: 'service', signerId: null },
  ];

  it('inherits director signer for deep leaf', () => {
    assert.equal(resolveEffectiveSignerId('dept', units), 'emp-service-head');
  });

  it('uses nearest explicit signer on the chain', () => {
    assert.equal(resolveEffectiveSignerId('sector', units), 'emp-director');
  });

  it('returns null when no signer exists on chain', () => {
    const orphan = [{ id: 'solo', parentId: null, signerId: null }];
    assert.equal(resolveEffectiveSignerId('solo', orphan), null);
  });
});
