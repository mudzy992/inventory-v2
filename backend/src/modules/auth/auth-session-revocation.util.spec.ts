import assert from 'node:assert/strict';
import test from 'node:test';
import {
  USER_AUTH_REVOCATION_TTL_SECONDS,
  authRevocationKey,
  authUserCacheKey,
  parseAuthRevocationMarker,
} from './auth-cache.util';
import {
  prepareUserSessionRevocation,
  revokeRefreshTokensInTransaction,
  sweepRefreshTokensAfterCommit,
  type AuthRevocationRedis,
} from './auth-session-revocation.util';

interface FakeCall {
  kind: 'set' | 'del';
  key: string;
  value?: string;
  ttl?: number;
}

const fakeRedis = (setResult: unknown): {
  redis: AuthRevocationRedis;
  calls: FakeCall[];
} => {
  const calls: FakeCall[] = [];
  return {
    calls,
    redis: {
      set: async (key, value, mode, ttlSeconds) => {
        assert.equal(mode, 'EX');
        calls.push({ kind: 'set', key, value, ttl: ttlSeconds });
        return setResult;
      },
      del: async (key) => {
        calls.push({ kind: 'del', key });
        return 1;
      },
    },
  };
};

test('writes an EX marker with a TTL longer than the cache and deletes the old entry', async () => {
  const { redis, calls } = fakeRedis('OK');
  const marker = await prepareUserSessionRevocation(redis, 'user-1', 'user_deactivated', 5_000);
  assert.deepEqual(marker, { revokedAt: 5_000, reason: 'user_deactivated' });
  assert.deepEqual(calls[0], {
    kind: 'set',
    key: authRevocationKey('user-1'),
    value: JSON.stringify(marker),
    ttl: USER_AUTH_REVOCATION_TTL_SECONDS,
  });
  assert.equal(calls[0]?.ttl && calls[0].ttl > 30, true);
  assert.deepEqual(parseAuthRevocationMarker(JSON.parse(calls[0]!.value!)), marker);
  assert.deepEqual(calls[1], { kind: 'del', key: authUserCacheKey('user-1') });
});

test('fails closed when Redis refuses the marker — no silent stale session', async () => {
  for (const refused of [null, undefined, 0, 'NO']) {
    const { redis, calls } = fakeRedis(refused);
    await assert.rejects(
      prepareUserSessionRevocation(redis, 'user-1', 'user_deactivated'),
      /Cannot revoke sessions for user user-1/u,
    );
    assert.equal(calls.length, 1, 'must not proceed to the DB transaction');
  }
});

test('propagates Redis write/read errors instead of swallowing them', async () => {
  const broken: AuthRevocationRedis = {
    set: async () => {
      throw new Error('READONLY');
    },
    del: async () => 1,
  };
  await assert.rejects(
    prepareUserSessionRevocation(broken, 'user-1', 'user_updated'),
    /READONLY/u,
  );
  const other: AuthRevocationRedis = {
    set: async () => 'OK',
    del: async () => {
      throw new Error('ECONNRESET');
    },
  };
  await assert.rejects(
    prepareUserSessionRevocation(other, 'user-1', 'user_updated'),
    /ECONNRESET/u,
  );
});

const fakeTokenStore = (rows: { userId: string; revokedAt: Date | null }[]) => ({
  calls: [] as { userId: string; at: Date }[],
  refreshToken: {
    updateMany: async ({
      where,
      data,
    }: {
      where: { userId: string; revokedAt: null };
      data: { revokedAt: Date };
    }) => {
      const matched = rows.filter((r) => r.userId === where.userId && r.revokedAt === null);
      matched.forEach((r) => {
        r.revokedAt = data.revokedAt;
      });
      return { count: matched.length };
    },
  },
});

test('revokeRefreshTokensInTransaction revokes every active token for that user only', async () => {
  const now = new Date('2026-10-27T12:00:00.000Z');
  const rows = [
    { userId: 'u1', revokedAt: null },
    { userId: 'u1', revokedAt: null },
    { userId: 'u1', revokedAt: new Date('2026-01-01T00:00:00.000Z') },
    { userId: 'u2', revokedAt: null },
  ];
  const store = fakeTokenStore(rows);
  const count = await revokeRefreshTokensInTransaction(store as never, 'u1', now);
  assert.equal(count, 2);
  assert.deepEqual(rows.slice(0, 2).map((r) => r.revokedAt), [now, now]);
  assert.equal(rows[3]?.revokedAt, null, 'other users must be untouched');
});

test('the post-commit sweep is the same idempotent operation', async () => {
  const store = fakeTokenStore([{ userId: 'u1', revokedAt: null }]);
  await sweepRefreshTokensAfterCommit(store as never, 'u1', new Date());
  assert.equal(await sweepRefreshTokensAfterCommit(store as never, 'u1', new Date()), 0);
});
