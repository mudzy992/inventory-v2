import type { PrismaService } from '../../prisma/prisma.service';

type RefreshTokenStore = Pick<PrismaService, 'refreshToken'>;

/**
 * Claims a refresh token for a single rotation attempt. The conditional write
 * is the concurrency boundary: only one concurrent caller can revoke this row.
 */
export const claimRefreshTokenForRotation = async (
  store: RefreshTokenStore,
  refreshTokenId: string,
  now: Date,
): Promise<boolean> => {
  const result = await store.refreshToken.updateMany({
    where: {
      id: refreshTokenId,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: { revokedAt: now },
  });
  return result.count === 1;
};
