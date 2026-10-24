import assert from 'node:assert/strict';
import test from 'node:test';
import { getSetupTokenFailure } from './setup-auth.util';

test('allows tokenless setup only outside production', () => {
  assert.equal(getSetupTokenFailure(undefined, undefined, false), undefined);
  assert.equal(getSetupTokenFailure(undefined, undefined, true), 'missing-production-token');
  assert.equal(getSetupTokenFailure('   ', undefined, true), 'missing-production-token');
});

test('requires an exact match when a setup token is configured', () => {
  assert.equal(getSetupTokenFailure('secret', 'secret', true), undefined);
  assert.equal(getSetupTokenFailure('secret', 'wrong', false), 'invalid-token');
  assert.equal(getSetupTokenFailure('secret', undefined, true), 'invalid-token');
});
