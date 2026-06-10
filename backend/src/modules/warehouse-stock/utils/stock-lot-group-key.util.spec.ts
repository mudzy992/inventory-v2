import { buildStockLotGroupKey, buildStockLotGroupWhere } from './stock-lot-group-key.util';

describe('stock-lot-group-key.util', () => {
  it('builds catalog group key when catalogItemId is set', () => {
    const key = buildStockLotGroupKey({
      catalogItemId: 'abc-123',
      categoryId: 'cat-1',
      productName: 'HP ProDesk',
    });
    expect(key).toBe('catalog:abc-123');
    expect(buildStockLotGroupWhere(key)).toEqual({ catalogItemId: 'abc-123' });
  });

  it('builds product group key from category and normalized name', () => {
    const key = buildStockLotGroupKey({
      catalogItemId: null,
      categoryId: 'cat-1',
      productName: '  HP ProDesk  ',
    });
    expect(key).toBe('product:cat-1::hp prodesk');
    expect(buildStockLotGroupWhere(key)).toEqual({
      categoryId: 'cat-1',
      productName: { equals: 'hp prodesk', mode: 'insensitive' },
    });
  });
});
