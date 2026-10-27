import type { PrismaService } from '../../prisma/prisma.service';
import {
  USER_AUTH_REVOCATION_TTL_SECONDS,
  authRevocationKey,
  authUserCacheKey,
  type AuthRevocationMarker,
} from './auth-cache.util';

/** Minimal ioredis surface — real client or a deterministic fake in tests. */
export interface AuthRevocationRedis {
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

type RefreshTokenStore = Pick<PrismaService, 'refreshToken'>;

/**
 * MUST run BEFORE the deactivating/updating DB transaction.
 *
 * Writing the marker first removes the post-commit window in which a cached
 * identity would still be accepted. It is idempotent and fail-closed: if
 * Redis refuses the write, we abort before changing the user at all, so an
 * operator can retry instead of silently leaving a live session behind.
 * A failed DB transaction only leaves a harmless 60s marker (JwtStrategy
 * falls back to the DB, sees the user unchanged, and re-caches).
 */
export const prepareUserSessionRevocation = async (
  redis: AuthRevocationRedis,
  userId: string,
  reason: string,
  now: number = Date.now(),
): Promise<AuthRevocationMarker> => {
  const marker: AuthRevocationMarker = { revokedAt: now, reason };
  const stored = await redis.set(
    authRevocationKey(userId),
    JSON.stringify(marker),
    'EX',
    USER_AUTH_REVOCATION_TTL_SECONDS,
  );
  if (stored !== 'OK') {
    throw new Error(
      `Cannot revoke sessions for user ${userId}: Redis refused the auth revocation marker`,
    );
  }
  // Best-effort cleanup of the old entry. The marker is the authoritative
  // guard; unlike RedisService.del() this call propagates failures.
  await redis.del(authUserCacheKey(userId));
  return marker;
};

/**
 * MUST run INSIDE the same transaction as `user.update({ isActive: false })`.
 * Otherwise a deactivated account keeps valid refresh tokens in the DB and
 * would regain full access the moment it is reactivated (or via a concurrent
 * refresh that read `isActive` before the deactivation committed).
 */
export const revokeRefreshTokensInTransaction = async (
  store: RefreshTokenStore,
  userId: string,
  now: Date,
): Promise<number> => {
  const result = await store.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  });
  return result.count;
};

/**
 * Post-commit sweep for refresh tokens created by a refresh() call that was
 * in flight while the deactivation transaction committed.
 */
export const sweepRefreshTokensAfterCommit = revokeRefreshTokensInTransaction;
