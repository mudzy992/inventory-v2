import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildStockLotGroupKey, buildStockLotGroupWhere } from './stock-lot-group-key.util';

describe('stock-lot-group-key.util', () => {
  it('builds catalog group key when catalogItemId is set', () => {
    const key = buildStockLotGroupKey({
      catalogItemId: 'abc-123',
      categoryId: 'cat-1',
      productName: 'HP ProDesk',
    });
    assert.equal(key, 'catalog:abc-123');
    assert.deepEqual(buildStockLotGroupWhere(key), { catalogItemId: 'abc-123' });
  });

  it('builds product group key from category and normalized name', () => {
    const key = buildStockLotGroupKey({
      catalogItemId: null,
      categoryId: 'cat-1',
      productName: '  HP ProDesk  ',
    });
    assert.equal(key, 'product:cat-1::hp prodesk');
    assert.deepEqual(buildStockLotGroupWhere(key), {
      categoryId: 'cat-1',
      productName: { equals: 'hp prodesk', mode: 'insensitive' },
    });
  });
});
