import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';

/**
 * Shared auth-cache contract for JwtStrategy and every deactivation/update
 * path. Kept free of Nest/prisma imports so it can be unit-tested directly.
 *
 * Problem it solves: JwtStrategy used to `del(auth:user:<id>)` after a user
 * update, but its `setJson` is deliberately fire-and-forget. A request that
 * read the DB just BEFORE the update could write a stale cache entry just
 * AFTER the delete, leaving a deactivated/demoted identity alive for the
 * full 30s TTL. `RedisService.del()` also swallows errors, so a Redis blip
 * silently kept the stale entry.
 *
 * Fix: cache entries carry `cachedAt` (measured BEFORE the DB read), and a
 * short-lived revocation marker carries `revokedAt`. A cache hit is only
 * accepted when `cachedAt > revokedAt`. The marker TTL is twice the cache
 * TTL, so no in-flight write can outlive it.
 */

export const USER_AUTH_CACHE_TTL_SECONDS = 30;
export const USER_AUTH_REVOCATION_TTL_SECONDS = USER_AUTH_CACHE_TTL_SECONDS * 2;

export const authUserCacheKey = (userId: string): string => `auth:user:${userId}`;
export const authRevocationKey = (userId: string): string => `auth:revoked:${userId}`;

export interface CachedAuthenticatedUser extends AuthenticatedUser {
  /** Timestamp captured BEFORE the DB read that produced this entry. */
  cachedAt: number;
}

export interface AuthRevocationMarker {
  revokedAt: number;
  reason: string;
}

export const isFreshAuthCache = (
  cached: CachedAuthenticatedUser | undefined,
  marker: AuthRevocationMarker | null,
): cached is CachedAuthenticatedUser => {
  if (!cached || !Number.isFinite(cached.cachedAt)) return false;
  if (marker && Number.isFinite(marker.revokedAt) && marker.revokedAt >= cached.cachedAt) {
    return false;
  }
  return true;
};

/** Tolerates old/malformed Redis values: anything unknown is treated as revoked. */
export const parseAuthRevocationMarker = (value: unknown): AuthRevocationMarker | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<AuthRevocationMarker>;
  if (typeof record.revokedAt !== 'number' || !Number.isFinite(record.revokedAt)) return null;
  return { revokedAt: record.revokedAt, reason: typeof record.reason === 'string' ? record.reason : 'unknown' };
};

/** Never leak bookkeeping fields into the request-scoped user object. */
export const toAuthenticatedUser = (cached: CachedAuthenticatedUser): AuthenticatedUser => ({
  id: cached.id,
  username: cached.username,
  role: cached.role,
  employeeId: cached.employeeId,
  registrarScopes: [...cached.registrarScopes],
  coordinatorAssignments: [...cached.coordinatorAssignments],
  moderatorOrgRoots: [...cached.moderatorOrgRoots],
  moderatorWarehouseIds: [...cached.moderatorWarehouseIds],
});

export const buildCachedAuthenticatedUser = (
  user: AuthenticatedUser,
  cachedAt: number,
): CachedAuthenticatedUser => ({ ...user, cachedAt });
