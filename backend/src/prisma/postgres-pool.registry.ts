import type { Pool } from 'pg';
import { DEFAULT_DATABASE_POOL_MAX } from './database-config.util';

export interface PostgresPoolStats {
  max: number;
  total: number;
  idle: number;
  waiting: number;
}

/** The pg.Pool passed to PrismaPg is owned by PrismaService. Keep a process-local
 * reference so the periodic health signal can read real pool saturation instead
 * of guessing from Prisma query counts. Tests replace `getStats` through this
 * mutable registry without constructing a Nest application. */
let activePostgresPool: Pool | null = null;

const finiteCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const readActivePostgresPoolStats = (): PostgresPoolStats | null => {
  if (!activePostgresPool) {
    return null;
  }
  try {
    const configuredMax = activePostgresPool.options?.max;
    const max =
      typeof configuredMax === 'number' &&
      Number.isFinite(configuredMax) &&
      configuredMax > 0
        ? configuredMax
        : DEFAULT_DATABASE_POOL_MAX;
    return {
      max,
      total: finiteCount(activePostgresPool.totalCount),
      idle: finiteCount(activePostgresPool.idleCount),
      waiting: finiteCount(activePostgresPool.waitingCount),
    };
  } catch {
    return null;
  }
};

export const postgresPoolRegistry = {
  getStats: readActivePostgresPoolStats,
};

export const setActivePostgresPool = (pool: Pool | null): void => {
  activePostgresPool = pool;
};

export const clearActivePostgresPool = (): void => {
  activePostgresPool = null;
};

export { readActivePostgresPoolStats };
