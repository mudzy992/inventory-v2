import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  USER_AUTH_CACHE_TTL_SECONDS,
  USER_AUTH_REVOCATION_TTL_SECONDS,
  authRevocationKey,
  authUserCacheKey,
  buildCachedAuthenticatedUser,
  isFreshAuthCache,
  parseAuthRevocationMarker,
  toAuthenticatedUser,
} from './auth-cache.util';

const user: AuthenticatedUser = {
  id: 'user-1',
  username: 'alice',
  role: 'admin',
  employeeId: null,
  registrarScopes: [{ warehouseId: 'w1', categoryId: 'c1' }],
  coordinatorAssignments: [],
  moderatorOrgRoots: [],
  moderatorWarehouseIds: ['w1'],
};

test('key namespaces are distinct and the marker outlives the cache', () => {
  assert.equal(authUserCacheKey('user-1'), 'auth:user:user-1');
  assert.equal(authRevocationKey('user-1'), 'auth:revoked:user-1');
  assert.ok(USER_AUTH_REVOCATION_TTL_SECONDS > USER_AUTH_CACHE_TTL_SECONDS);
  assert.equal(USER_AUTH_REVOCATION_TTL_SECONDS, USER_AUTH_CACHE_TTL_SECONDS * 2);
});

test('a cached entry is fresh only when it postdates the revocation marker', () => {
  const cached = buildCachedAuthenticatedUser(user, 1_000);
  assert.equal(isFreshAuthCache(cached, null), true);
  assert.equal(isFreshAuthCache(cached, { revokedAt: 999, reason: 'older' }), true);
  // Same millisecond counts as revoked — fail closed on ties.
  assert.equal(isFreshAuthCache(cached, { revokedAt: 1_000, reason: 'tie' }), false);
  assert.equal(isFreshAuthCache(cached, { revokedAt: 1_001, reason: 'newer' }), false);
});

test('legacy or malformed cache entries are never trusted', () => {
  assert.equal(isFreshAuthCache(undefined, null), false);
  assert.equal(isFreshAuthCache({ ...user } as never, null), false);
  assert.equal(isFreshAuthCache({ ...user, cachedAt: Number.NaN }, null), false);
  assert.equal(isFreshAuthCache({ ...user, cachedAt: '1000' } as never, null), false);
});

test('marker parsing tolerates garbage but never treats it as a valid older marker', () => {
  assert.deepEqual(parseAuthRevocationMarker({ revokedAt: 42, reason: 'deactivated' }), {
    revokedAt: 42,
    reason: 'deactivated',
  });
  assert.deepEqual(parseAuthRevocationMarker({ revokedAt: 42 }), {
    revokedAt: 42,
    reason: 'unknown',
  });
  for (const bad of [null, undefined, 'x', 7, {}, { revokedAt: '42' }, { revokedAt: Infinity }]) {
    assert.equal(parseAuthRevocationMarker(bad), null);
  }
});

test('toAuthenticatedUser strips bookkeeping fields and preserves the scope arrays', () => {
  const cached = buildCachedAuthenticatedUser(user, 123);
  const restored = toAuthenticatedUser(cached);
  assert.deepEqual(restored, user);
  assert.equal('cachedAt' in restored, false);
  assert.notEqual(restored.registrarScopes, cached.registrarScopes);
  assert.deepEqual(cached.registrarScopes, user.registrarScopes);
});
