import type { PrismaService } from '../../../prisma/prisma.service';

type RefreshTokenStore = Pick<PrismaService, 'refreshToken'>;

export interface ExpiredRefreshTokenCleanupResult {
  deleted: number;
  hasMore: boolean;
}

export const cleanupExpiredRefreshTokens = async (
  store: RefreshTokenStore,
  now: Date,
  options: { batchSize?: number; maxBatches?: number } = {},
): Promise<ExpiredRefreshTokenCleanupResult> => {
  const batchSize = options.batchSize ?? 1000;
  const maxBatches = options.maxBatches ?? 20;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new RangeError('batchSize must be a positive safe integer');
  }
  if (!Number.isSafeInteger(maxBatches) || maxBatches < 1) {
    throw new RangeError('maxBatches must be a positive safe integer');
  }

  let deleted = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const expiredTokens = await store.refreshToken.findMany({
      where: { expiresAt: { lt: now } },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take: batchSize,
      select: { id: true },
    });
    if (expiredTokens.length === 0) {
      return { deleted, hasMore: false };
    }

    const result = await store.refreshToken.deleteMany({
      where: {
        id: { in: expiredTokens.map(({ id }) => id) },
        expiresAt: { lt: now },
      },
    });
    deleted += result.count;
    if (expiredTokens.length < batchSize) {
      return { deleted, hasMore: false };
    }
  }

  const remaining = await store.refreshToken.findMany({
    where: { expiresAt: { lt: now } },
    take: 1,
    select: { id: true },
  });
  return { deleted, hasMore: remaining.length > 0 };
};
