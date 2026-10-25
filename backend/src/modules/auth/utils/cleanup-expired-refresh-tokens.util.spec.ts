import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaService } from '../../../prisma/prisma.service';
import { cleanupExpiredRefreshTokens } from './cleanup-expired-refresh-tokens.util';

type TokenRecord = { id: string; expiresAt: Date };
type FindManyArgs = { where: { expiresAt: { lt: Date } }; take: number };
type DeleteManyArgs = { where: { id: { in: string[] }; expiresAt: { lt: Date } } };

const makeStore = (records: TokenRecord[]) => {
  const remaining = new Map(records.map((record) => [record.id, record]));
  const calls = { findMany: 0, deleteMany: 0 };
  const store = {
    refreshToken: {
      findMany: async ({ where, take }: FindManyArgs) => {
        calls.findMany += 1;
        return [...remaining.values()]
          .filter((record) => record.expiresAt < where.expiresAt.lt)
          .sort(
            (left, right) =>
              left.expiresAt.getTime() - right.expiresAt.getTime() || left.id.localeCompare(right.id),
          )
          .slice(0, take)
          .map(({ id }) => ({ id }));
      },
      deleteMany: async ({ where }: DeleteManyArgs) => {
        calls.deleteMany += 1;
        let count = 0;
        for (const id of where.id.in) {
          const record = remaining.get(id);
          if (record && record.expiresAt < where.expiresAt.lt) {
            remaining.delete(id);
            count += 1;
          }
        }
        return { count };
      },
    },
  } as unknown as Pick<PrismaService, 'refreshToken'>;
  return { store, remaining, calls };
};

const NOW = new Date('2026-10-25T12:00:00.000Z');

test('cleanupExpiredRefreshTokens deletes expired rows in bounded batches and preserves active tokens', async () => {
  const expired = Array.from({ length: 5 }, (_, index) => ({
    id: `expired-${index}`,
    expiresAt: new Date(NOW.getTime() - index - 1),
  }));
  const active = { id: 'active', expiresAt: new Date(NOW.getTime() + 60_000) };
  const { store, remaining, calls } = makeStore([...expired, active]);

  const result = await cleanupExpiredRefreshTokens(store, NOW, { batchSize: 2, maxBatches: 10 });

  assert.deepEqual(result, { deleted: 5, hasMore: false });
  assert.deepEqual([...remaining.keys()], ['active']);
  assert.equal(calls.deleteMany, 3);
});

test('cleanupExpiredRefreshTokens caps work per run and reports remaining rows', async () => {
  const records = Array.from({ length: 5 }, (_, index) => ({
    id: `expired-${index}`,
    expiresAt: new Date(NOW.getTime() - index - 1),
  }));
  const { store, remaining, calls } = makeStore(records);

  const result = await cleanupExpiredRefreshTokens(store, NOW, { batchSize: 2, maxBatches: 2 });

  assert.deepEqual(result, { deleted: 4, hasMore: true });
  assert.equal(remaining.size, 1);
  assert.equal(calls.deleteMany, 2);
});

test('cleanupExpiredRefreshTokens validates batch limits', async () => {
  const { store } = makeStore([]);
  await assert.rejects(
    cleanupExpiredRefreshTokens(store, NOW, { batchSize: 0 }),
    RangeError,
  );
});
