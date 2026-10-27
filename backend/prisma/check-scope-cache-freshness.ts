import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCOPE_CACHE_TTL_MS, getScopeCacheVersion, invalidateScopeCaches, isScopeCacheStale } from '../src/common/services/scope-cache.registry';

/**
 * Release gate for authorization-scope cache freshness.
 *
 * The scope services are Nest singletons holding in-memory org/warehouse/
 * category trees. Before this fix those caches were never invalidated, so an
 * admin changing the hierarchy could leave a backend replica authorising
 * against stale data until restart (and replicas disagreeing with each other).
 */
const ROOT = resolve('.');
const SRC = resolve(ROOT, 'src');

const main = (): void => {
  const registry = readFileSync(resolve(SRC, 'common/services/scope-cache.registry.ts'), 'utf8');
  assert.match(registry, /SCOPE_CACHE_TTL_MS\s*=\s*30_000/u);
  assert.match(registry, /invalidateScopeCaches/u);
  assert.equal(SCOPE_CACHE_TTL_MS, 30_000);

  for (const file of [
    'common/services/registrar-scope.service.ts',
    'common/services/moderator-scope.service.ts',
  ]) {
    const source = readFileSync(resolve(SRC, file), 'utf8');
    assert.match(source, /isScopeCacheStale\(/u, `${file} must enforce the TTL/version check`);
    assert.match(source, /getScopeCacheVersion\(/u, `${file} must track the version`);
    assert.match(source, /\.clear\(\)|= new Map|= null/u, `${file} must actually drop stale entries`);
  }

  // All three hierarchy write surfaces must bump the version after a commit.
  for (const file of [
    'modules/org-units/org-units.service.ts',
    'modules/warehouses/warehouses.service.ts',
    'modules/categories/categories.service.ts',
  ]) {
    const source = readFileSync(resolve(SRC, file), 'utf8');
    assert.match(source, /invalidateScopeCaches\(\)/u, `${file} must invalidate scope caches on write`);
  }
  assert.ok(
    existsSync(resolve(SRC, 'common/services/scope-cache.registry.spec.ts')),
    'freshness behaviour must have a unit spec',
  );
  assert.equal(
    existsSync(resolve(SRC, 'modules/transfers/utils/docx-to-pdf.util.ts')),
    false,
    'the dead, unstructured-logging docx util must stay removed',
  );

  // Behavioural smoke of the registry itself.
  const before = getScopeCacheVersion();
  const now = Date.now();
  assert.equal(isScopeCacheStale(now, before, now + 1), false);
  assert.equal(isScopeCacheStale(now, before, now + SCOPE_CACHE_TTL_MS), true);
  const after = invalidateScopeCaches();
  assert.equal(after, before + 1);
  assert.equal(isScopeCacheStale(now, before, now + 1), true);

  console.log(
    'Scope cache freshness check passed (30s TTL + version invalidation on both scope services and 3 hierarchy write paths; dead console-log util removed).',
  );
};

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
