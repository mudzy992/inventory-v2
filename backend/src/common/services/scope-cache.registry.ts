/**
 * Freshness contract for process-local AUTHORIZATION scope caches.
 *
 * `RegistrarScopeService` and `ModeratorScopeService` cache org-unit,
 * warehouse and category trees in memory to avoid full-table reads on every
 * scope check. Those caches used to live forever: after an admin changed the
 * org structure, a category parent or a warehouse, a singleton could keep
 * authorising with stale data until the process restarted — and with N
 * replicas every instance could disagree.
 *
 * Two independent guards:
 *  1. `invalidateScopeCaches()` bumps a process-wide version; write paths
 *     call it so the very next scope read reloads.
 *  2. A hard TTL bounds staleness even when a write path forgets to bump
 *     (or the change came from another process / direct SQL).
 */

export const SCOPE_CACHE_TTL_MS = 30_000;

let version = 0;

export const getScopeCacheVersion = (): number => version;

export const invalidateScopeCaches = (): number => {
  version += 1;
  return version;
};

export const isScopeCacheStale = (
  loadedAt: number,
  loadedVersion: number,
  now: number = Date.now(),
): boolean =>
  loadedVersion !== getScopeCacheVersion() || now - loadedAt >= SCOPE_CACHE_TTL_MS;
