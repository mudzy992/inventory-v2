import assert from 'node:assert/strict';
import test from 'node:test';
import { ModeratorScopeService } from './moderator-scope.service';
import { RegistrarScopeService } from './registrar-scope.service';
import {
  SCOPE_CACHE_TTL_MS,
  getScopeCacheVersion,
  invalidateScopeCaches,
  isScopeCacheStale,
} from './scope-cache.registry';

const NOW = Date.parse('2026-10-27T12:00:00.000Z');

test('a fresh cache is not stale; TTL and version bumps both invalidate it', () => {
  const version = getScopeCacheVersion();
  assert.equal(isScopeCacheStale(NOW, version, NOW + 1000), false);
  assert.equal(isScopeCacheStale(NOW, version, NOW + SCOPE_CACHE_TTL_MS - 1), false);
  assert.equal(isScopeCacheStale(NOW, version, NOW + SCOPE_CACHE_TTL_MS), true);
  assert.equal(isScopeCacheStale(NOW, version - 1, NOW + 1000), true);
  assert.equal(SCOPE_CACHE_TTL_MS, 30_000);
});

test('invalidateScopeCaches monotonically bumps the process-wide version', () => {
  const before = getScopeCacheVersion();
  const after = invalidateScopeCaches();
  assert.equal(after, before + 1);
  assert.equal(isScopeCacheStale(NOW, before, NOW + 1), true);
  assert.equal(isScopeCacheStale(NOW, after, NOW + 1), false);
});

const makeCategoryPrisma = () => {
  let calls = 0;
  let categories: { id: string; parentId: string | null }[] = [{ id: 'root', parentId: null }];
  return {
    calls: () => calls,
    setCategories: (rows: { id: string; parentId: string | null }[]) => {
      categories = rows;
    },
    prisma: {
      category: {
        findMany: async () => {
          calls += 1;
          return categories;
        },
      },
    },
  };
};

test('RegistrarScopeService reloads category tree after a scope invalidation', async () => {
  const fake = makeCategoryPrisma();
  const service = new RegistrarScopeService(fake.prisma as never, {} as never, {} as never);
  const first = await service.expandCategoryIds(['root']);
  assert.deepEqual([...first], ['root']);
  assert.equal(fake.calls(), 1);

  fake.setCategories([
    { id: 'root', parentId: null },
    { id: 'child', parentId: 'root' },
  ]);
  await service.expandCategoryIds(['root']);
  assert.equal(fake.calls(), 1, 'fresh cache must be reused');

  invalidateScopeCaches();
  const afterBump = await service.expandCategoryIds(['root']);
  assert.deepEqual([...afterBump].sort(), ['child', 'root']);
  assert.equal(fake.calls(), 2, 'a write-path bump must force a reload');
});

test('RegistrarScopeService reloads after the TTL even without a bump', async () => {
  const fake = makeCategoryPrisma();
  const service = new RegistrarScopeService(fake.prisma as never, {} as never, {} as never);
  await service.expandCategoryIds(['root']);
  assert.equal(fake.calls(), 1);

  const realNow = Date.now;
  Date.now = () => realNow() + SCOPE_CACHE_TTL_MS + 1;
  try {
    fake.setCategories([
      { id: 'root', parentId: null },
      { id: 'late-child', parentId: 'root' },
    ]);
    const result = await service.expandCategoryIds(['root']);
    assert.deepEqual([...result].sort(), ['late-child', 'root']);
    assert.equal(fake.calls(), 2, 'TTL must bound staleness for cross-process writes');
  } finally {
    Date.now = realNow;
  }
});

const makeModeratorHarness = () => {
  let calls = 0;
  let expanded = ['org-1'];
  const orgScope = {
    expandOrgUnitIds: async () => {
      calls += 1;
      return expanded;
    },
  };
  const service = new ModeratorScopeService({} as never, orgScope as never, {} as never);
  return {
    service,
    calls: () => calls,
    setExpanded: (rows: string[]) => {
      expanded = rows;
    },
  };
};

test('ModeratorScopeService scope expansion is cache-bounded and invalidatable', async () => {
  const h = makeModeratorHarness();
  assert.deepEqual(await h.service.expandModeratorOrgRoots(['org-1']), ['org-1']);
  assert.equal(h.calls(), 1);
  h.setExpanded(['org-1', 'org-2']);
  assert.deepEqual(await h.service.expandModeratorOrgRoots(['org-1']), ['org-1']);
  assert.equal(h.calls(), 1, 'fresh cache must be reused');

  invalidateScopeCaches();
  assert.deepEqual(await h.service.expandModeratorOrgRoots(['org-1']), ['org-1', 'org-2']);
  assert.equal(h.calls(), 2);
});

test('empty moderator roots never touch the cache or DB', async () => {
  const h = makeModeratorHarness();
  assert.deepEqual(await h.service.expandModeratorOrgRoots([]), []);
  assert.equal(h.calls(), 0);
});
