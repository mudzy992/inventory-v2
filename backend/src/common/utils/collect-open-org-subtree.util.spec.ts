import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectOpenSubtreeIds } from './collect-open-org-subtree.util';

const units = [
  { id: 'dist', parentId: 'root', signerId: 'emp-dist', locationCityId: null },
  { id: 'pod-a', parentId: 'dist', signerId: 'emp-a', locationCityId: null },
  { id: 'sluz-a', parentId: 'pod-a', signerId: null, locationCityId: null },
  { id: 'pod-b', parentId: 'dist', signerId: null, locationCityId: null },
  { id: 'pj-b', parentId: 'pod-b', signerId: null, locationCityId: null },
  { id: 'odj-b', parentId: 'pj-b', signerId: null, locationCityId: null },
];

describe('collect-open-org-subtree.util', () => {
  it('includes root and only branches without a signer blocker', () => {
    const actual = collectOpenSubtreeIds('dist', units, 'signerId');
    assert.deepEqual(actual, ['dist', 'pod-b', 'pj-b', 'odj-b']);
  });

  it('returns only root when all children define location', () => {
    const withLocation = [
      { id: 'x', parentId: null, signerId: null, locationCityId: 'c1' },
      { id: 'y', parentId: 'x', signerId: null, locationCityId: 'c2' },
    ];
    assert.deepEqual(collectOpenSubtreeIds('x', withLocation, 'locationCityId'), ['x']);
  });
});
