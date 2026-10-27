import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import type { JwtPayload } from '../../../common/types/jwt-payload.type';
import {
  authRevocationKey,
  authUserCacheKey,
  buildCachedAuthenticatedUser,
  type AuthRevocationMarker,
  type CachedAuthenticatedUser,
} from '../auth-cache.util';
import { JwtStrategy } from './jwt.strategy';

const PAYLOAD: JwtPayload = { sub: 'user-1', username: 'alice', role: 'admin' };

const dbRecord = (isActive: boolean) => ({
  id: 'user-1',
  username: 'alice',
  role: isActive ? 'admin' : 'user',
  employeeId: null,
  isActive,
  registrarAssignments: [],
  inventoryCoordinatorAssignments: [],
  moderatorOrgAssignments: [],
  moderatorWarehouseAssignments: [],
});

interface FakeRedis {
  getJson: <T>(key: string) => Promise<T | undefined>;
  setJson: (key: string, value: unknown, ttl: number) => Promise<void>;
}

const makeRedis = (store: Map<string, unknown>): FakeRedis => ({
  getJson: async <T>(key: string): Promise<T | undefined> => store.get(key) as T | undefined,
  setJson: async (key: string, value: unknown) => {
    store.set(key, value);
  },
});

const makeStrategy = (
  store: Map<string, unknown>,
  findUnique: () => ReturnType<typeof dbRecord>,
  onRead?: () => void,
  onWrite?: (value: unknown) => void,
): JwtStrategy => {
  const redis = makeRedis(store);
  const wrappedRedis: FakeRedis = {
    ...redis,
    setJson: async (key, value, ttl) => {
      onWrite?.(value);
      await redis.setJson(key, value, ttl);
    },
  };
  return new JwtStrategy(
    { getOrThrow: () => 'test-secret' } as never,
    {
      user: {
        findUnique: async () => {
          onRead?.();
          return findUnique();
        },
      },
    } as never,
    wrappedRedis as never,
  );
};

const cachedUser = (overrides: Partial<CachedAuthenticatedUser> = {}): CachedAuthenticatedUser => ({
  ...buildCachedAuthenticatedUser(
    {
      id: 'user-1',
      username: 'alice',
      role: 'admin',
      employeeId: null,
      registrarScopes: [],
      coordinatorAssignments: [],
      moderatorOrgRoots: [],
      moderatorWarehouseIds: [],
    },
    1_000,
  ),
  ...overrides,
});

test('a fresh cache hit skips the DB and never exposes cachedAt', async () => {
  const store = new Map<string, unknown>();
  store.set(authUserCacheKey('user-1'), cachedUser());
  let reads = 0;
  const strategy = makeStrategy(store, () => dbRecord(true), () => {
    reads += 1;
  });
  const result = await strategy.validate(PAYLOAD);
  assert.equal(reads, 0);
  assert.equal(result.role, 'admin');
  assert.equal('cachedAt' in result, false);
  assert.equal(store.size, 1, 'no DB fallback means no cache rewrite');
});

test('a deactivation marker invalidates the cache and an inactive user is rejected', async () => {
  const store = new Map<string, unknown>();
  store.set(authUserCacheKey('user-1'), cachedUser());
  store.set(authRevocationKey('user-1'), {
    revokedAt: 2_000,
    reason: 'user_deactivated',
  } satisfies AuthRevocationMarker);
  let reads = 0;
  const strategy = makeStrategy(store, () => dbRecord(false), () => {
    reads += 1;
  });
  await assert.rejects(strategy.validate(PAYLOAD), UnauthorizedException);
  assert.equal(reads, 1, 'the marker must force a fresh DB read');
});

test('a stale marker does not permanently block a reactivated account', async () => {
  const store = new Map<string, unknown>();
  store.set(authUserCacheKey('user-1'), cachedUser({ cachedAt: 5_000 }));
  store.set(authRevocationKey('user-1'), { revokedAt: 2_000, reason: 'user_deactivated' });
  let reads = 0;
  const strategy = makeStrategy(store, () => dbRecord(true), () => {
    reads += 1;
  });
  assert.equal((await strategy.validate(PAYLOAD)).role, 'admin');
  assert.equal(reads, 0);
  store.delete(authRevocationKey('user-1'));
  await strategy.validate(PAYLOAD);
  assert.equal(reads, 0);
});

test('legacy cache entries without cachedAt are re-validated against the DB', async () => {
  const store = new Map<string, unknown>();
  store.set(authUserCacheKey('user-1'), cachedUser({ cachedAt: undefined as never }));
  let reads = 0;
  const strategy = makeStrategy(store, () => dbRecord(true), () => {
    reads += 1;
  });
  await strategy.validate(PAYLOAD);
  assert.equal(reads, 1);
  const rewritten = store.get(authUserCacheKey('user-1')) as CachedAuthenticatedUser;
  assert.equal(typeof rewritten.cachedAt, 'number');
});

test('cachedAt is captured BEFORE the DB read, so a concurrent revocation wins', async () => {
  const store = new Map<string, unknown>();
  let now = 10_000;
  const realNow = Date.now;
  Date.now = () => now;
  let reads = 0;
  let deactivated = false;
  try {
    const strategy = makeStrategy(
      store,
      () => {
        if (reads === 1) {
          // A deactivation commits while the first DB read is in flight; the
          // read itself still saw the active user, but must not be cached as
          // authoritative once the marker exists.
          now = 20_000;
          deactivated = true;
          store.set(authRevocationKey('user-1'), {
            revokedAt: 20_000,
            reason: 'user_deactivated',
          });
          return dbRecord(true);
        }
        return dbRecord(!deactivated);
      },
      () => {
        reads += 1;
      },
    );
    await strategy.validate(PAYLOAD);
    const cached = store.get(authUserCacheKey('user-1')) as CachedAuthenticatedUser;
    assert.equal(cached.cachedAt, 10_000, 'must use the pre-read timestamp, not the post-read one');

    // The in-flight request's late write cannot resurrect the identity.
    await assert.rejects(strategy.validate(PAYLOAD), UnauthorizedException);
    assert.equal(reads, 2, 'the marker must force a second, authoritative DB read');
  } finally {
    Date.now = realNow;
  }
});

test('malformed marker values are treated as stale, not silently ignored', async () => {
  const store = new Map<string, unknown>();
  store.set(authUserCacheKey('user-1'), cachedUser());
  store.set(authRevocationKey('user-1'), { revokedAt: 'not-a-number' });
  let reads = 0;
  const strategy = makeStrategy(store, () => dbRecord(true), () => {
    reads += 1;
  });
  await strategy.validate(PAYLOAD);
  assert.equal(reads, 1);
});
