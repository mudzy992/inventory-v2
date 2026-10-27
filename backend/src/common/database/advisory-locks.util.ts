import { Prisma } from '../../../generated/prisma/client';

/**
 * N-14: PostgreSQL advisory locks are identified by a (namespace, key) pair.
 * The namespace is reserved for this application; each operational lock has a
 * named key so a future change cannot accidentally collide with another
 * subsystem using the same magic number.
 */
export const ADVISORY_LOCK_NAMESPACE = 1800043170;

export const ADVISORY_LOCKS = {
  categoryTree: 24681,
  setupBootstrap: 13579,
} as const;

export const advisoryLockSql = (key: number) => Prisma.sql`
  SELECT 1 FROM (
    SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_NAMESPACE}, ${key})
  ) AS advisory_lock
`;
