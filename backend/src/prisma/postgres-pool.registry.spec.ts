import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Pool } from 'pg';
import {
  clearActivePostgresPool,
  postgresPoolRegistry,
  readActivePostgresPoolStats,
  setActivePostgresPool,
} from './postgres-pool.registry';

const fakePool = (overrides: Record<string, unknown> = {}): Pool =>
  ({
    options: { max: 10 },
    totalCount: 4,
    idleCount: 3,
    waitingCount: 1,
    ...overrides,
  }) as unknown as Pool;

describe('postgresPoolRegistry', () => {
  it('returns null before a PrismaService has registered its pool', () => {
    clearActivePostgresPool();
    assert.equal(readActivePostgresPoolStats(), null);
    assert.equal(postgresPoolRegistry.getStats(), null);
  });

  it('reads live pg.Pool counters and its configured maximum', () => {
    try {
      setActivePostgresPool(fakePool());
      assert.deepEqual(readActivePostgresPoolStats(), {
        max: 10,
        total: 4,
        idle: 3,
        waiting: 1,
      });
    } finally {
      clearActivePostgresPool();
    }
  });

  it('falls back to the default maximum and tolerates malformed counters', () => {
    try {
      setActivePostgresPool(
        fakePool({ options: {}, totalCount: Number.NaN, idleCount: undefined }),
      );
      assert.deepEqual(readActivePostgresPoolStats(), {
        max: 10,
        total: 0,
        idle: 0,
        waiting: 1,
      });
    } finally {
      clearActivePostgresPool();
    }
  });

  it('returns null when reading a disposed pool throws', () => {
    try {
      setActivePostgresPool({
        get options() {
          throw new Error('pool is closed');
        },
        totalCount: 0,
        idleCount: 0,
        waitingCount: 0,
      } as unknown as Pool);
      assert.equal(readActivePostgresPoolStats(), null);
    } finally {
      clearActivePostgresPool();
    }
  });
});
