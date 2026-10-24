import assert from 'node:assert/strict';
import test from 'node:test';
import { wouldCreateCategoryCycle } from './category-cycle.util';

const categories = [
  { id: 'root', parentId: null },
  { id: 'child', parentId: 'root' },
  { id: 'leaf', parentId: 'child' },
];

test('rejects reparenting a category under one of its descendants', () => {
  assert.equal(wouldCreateCategoryCycle('root', 'leaf', categories), true);
  assert.equal(wouldCreateCategoryCycle('child', 'leaf', categories), true);
});

test('allows a valid ancestor or top-level assignment', () => {
  assert.equal(wouldCreateCategoryCycle('leaf', 'root', categories), false);
  assert.equal(wouldCreateCategoryCycle('child', null, categories), false);
});

test('refuses to extend a pre-existing corrupt cycle', () => {
  const corrupt = [
    { id: 'a', parentId: 'b' },
    { id: 'b', parentId: 'a' },
    { id: 'target', parentId: null },
  ];
  assert.equal(wouldCreateCategoryCycle('target', 'a', corrupt), true);
});
