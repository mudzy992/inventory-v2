import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getEffectiveCatalogItemId,
  isLineMissingCatalog,
} from './effective-catalog.util';

describe('effective-catalog.util', () => {
  it('prefers equipment.catalogItemId', () => {
    assert.equal(
      getEffectiveCatalogItemId({
        catalogItemId: 'cat-direct',
        stockLot: { catalogItemId: 'cat-lot' },
      }),
      'cat-direct',
    );
  });

  it('falls back to stockLot.catalogItemId', () => {
    assert.equal(
      getEffectiveCatalogItemId({
        catalogItemId: null,
        stockLot: { catalogItemId: 'cat-lot' },
      }),
      'cat-lot',
    );
  });

  it('returns null when neither is set', () => {
    assert.equal(getEffectiveCatalogItemId({ catalogItemId: null, stockLot: null }), null);
    assert.equal(isLineMissingCatalog({ catalogItemId: null, stockLot: null }), true);
    assert.equal(isLineMissingCatalog({ catalogItemId: 'x', stockLot: null }), false);
  });
});
