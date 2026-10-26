import assert from 'node:assert/strict';
import { PostgresMetricsService } from '../src/modules/health/postgres-metrics.service';
import { SettingsService } from '../src/modules/settings/settings.service';
import { PrismaService } from '../src/prisma/prisma.service';

interface CapturedLog {
  level: 'log' | 'warn' | 'error';
  line: string;
}

const previousPoolMax = process.env.DATABASE_POOL_MAX;
// Prove that deployment configuration reaches the real pg.Pool, not just the
// parsed environment value. The CI database has ample max_connections for 3.
process.env.DATABASE_POOL_MAX = '3';

const main = async (): Promise<void> => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ''));
  if (
    process.env.NODE_ENV !== 'test' ||
    !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
    databaseName !== 'inventory_ci'
  ) {
    throw new Error('PostgreSQL metrics integration check is restricted to the local inventory_ci test database');
  }

  const prisma = new PrismaService();
  const settings = {
    getNumberValue: async (_key: string, fallback: number): Promise<number> => fallback,
  } as unknown as SettingsService;
  const service = new PostgresMetricsService(prisma, settings);
  const logs: CapturedLog[] = [];
  (service as unknown as { logger: Record<string, (line: string) => void> }).logger = {
    log: (line: string) => logs.push({ level: 'log', line }),
    warn: (line: string) => logs.push({ level: 'warn', line }),
    error: (line: string) => logs.push({ level: 'error', line }),
  };

  try {
    await prisma.$connect();
    const snapshot = await service.collectMetrics();
    assert.equal(snapshot.poolMax, 3, 'DATABASE_POOL_MAX must configure the real pg.Pool');
    assert.equal(snapshot.poolUnavailable, false);
    assert.equal(snapshot.dbState, 'connected');
    assert.ok(typeof snapshot.latencyMs === 'number' && snapshot.latencyMs >= 0);
    assert.ok(snapshot.poolTotal >= 1, 'SELECT 1 must open a pooled connection');
    assert.ok(snapshot.poolIdle >= 0);
    assert.ok(snapshot.poolWaiting >= 0);
    assert.ok(snapshot.poolUtilizationPercent >= 0 && snapshot.poolUtilizationPercent <= 100);

    const reported = await service.reportMetrics();
    assert.ok(reported);
    assert.equal(logs.length, 1);
    assert.ok(['log', 'warn'].includes(logs[0].level));
    const line = JSON.parse(logs[0].line) as Record<string, unknown>;
    assert.equal(line.event, 'postgres_pool_latency');
    assert.equal(line.poolMax, 3);
    assert.equal(line.poolUnavailable, false);
    assert.equal(line.dbState, 'connected');
    assert.ok(Array.isArray(line.reasons));
    assert.equal(line.level, logs[0].level);

    console.log(
      `Verified PostgreSQL pool/latency metrics: max=${reported.poolMax}, ` +
        `total=${reported.poolTotal}, latencyMs=${reported.latencyMs}.`,
    );
  } finally {
    try {
      await prisma.$disconnect();
    } finally {
      if (previousPoolMax === undefined) {
        delete process.env.DATABASE_POOL_MAX;
      } else {
        process.env.DATABASE_POOL_MAX = previousPoolMax;
      }
    }
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
