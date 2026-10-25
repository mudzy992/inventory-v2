import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveParentAssetCategoryId } from './resolve-parent-asset-category.util';

describe('resolveParentAssetCategoryId', () => {
  it('returns parent when equipment is on leaf category', async () => {
    const categories = new Map([
      ['leaf', { id: 'leaf', parentId: 'parent', categoryKind: 'ASSET' }],
      ['parent', { id: 'parent', parentId: null, categoryKind: 'ASSET' }],
    ]);
    const reader = {
      findUnique: async ({ where }: { where: { id: string } }) => categories.get(where.id) ?? null,
    };

    assert.equal(await resolveParentAssetCategoryId(reader, 'leaf'), 'parent');
  });

  it('returns same id when already parent category', async () => {
    const categories = new Map([
      ['parent', { id: 'parent', parentId: null, categoryKind: 'ASSET' }],
    ]);
    const reader = {
      findUnique: async ({ where }: { where: { id: string } }) => categories.get(where.id) ?? null,
    };

    assert.equal(await resolveParentAssetCategoryId(reader, 'parent'), 'parent');
  });
});
