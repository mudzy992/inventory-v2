import { resolveParentAssetCategoryId } from './resolve-parent-asset-category.util';

describe('resolveParentAssetCategoryId', () => {
  const reader = {
    findUnique: jest.fn(),
  };

  beforeEach(() => {
    reader.findUnique.mockReset();
  });

  it('returns parent when equipment is on leaf category', async () => {
    reader.findUnique
      .mockResolvedValueOnce({ id: 'leaf', parentId: 'parent', categoryKind: 'ASSET' })
      .mockResolvedValueOnce({ id: 'parent', parentId: null, categoryKind: 'ASSET' });

    const actual = await resolveParentAssetCategoryId(reader, 'leaf');
    expect(actual).toBe('parent');
  });

  it('returns same id when already parent category', async () => {
    reader.findUnique.mockResolvedValueOnce({ id: 'parent', parentId: null, categoryKind: 'ASSET' });

    const actual = await resolveParentAssetCategoryId(reader, 'parent');
    expect(actual).toBe('parent');
  });
});
