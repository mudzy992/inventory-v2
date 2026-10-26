import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PrismaService } from '../../prisma/prisma.service';
import { postgresPoolRegistry } from '../../prisma/postgres-pool.registry';
import { SettingsService } from '../settings/settings.service';
import { PostgresMetricsService } from './postgres-metrics.service';

interface CapturedLog {
  level: 'log' | 'warn' | 'error';
  line: string;
}

const createHarness = (
  options: {
    query?: () => Promise<unknown>;
    stats?: ReturnType<typeof postgresPoolRegistry.getStats>;
    thresholds?: Record<string, number>;
  } = {},
): {
  service: PostgresMetricsService;
  logs: CapturedLog[];
  restore: () => void;
} => {
  const originalGetStats = postgresPoolRegistry.getStats;
  postgresPoolRegistry.getStats = () =>
    options.stats === undefined ? { max: 10, total: 4, idle: 3, waiting: 0 } : options.stats;
  const prisma = {
    $queryRaw: options.query ?? (async () => [{ '?column?': 1 }]),
  } as unknown as PrismaService;
  const settings = {
    getNumberValue: async (key: string, fallback: number): Promise<number> =>
      options.thresholds?.[key] ?? fallback,
  } as unknown as SettingsService;
  const service = new PostgresMetricsService(prisma, settings);
  const logs: CapturedLog[] = [];
  (service as unknown as { logger: Record<string, (line: string) => void> }).logger = {
    log: (line: string) => logs.push({ level: 'log', line }),
    warn: (line: string) => logs.push({ level: 'warn', line }),
    error: (line: string) => logs.push({ level: 'error', line }),
  };
  return {
    service,
    logs,
    restore: () => {
      postgresPoolRegistry.getStats = originalGetStats;
    },
  };
};

describe('PostgresMetricsService', () => {
  it('emits a structured healthy snapshot with real pool counters', async (t) => {
    const { service, logs, restore } = createHarness();
    t.after(restore);
    const snapshot = await service.reportMetrics();
    assert.ok(snapshot);
    assert.equal(snapshot.dbState, 'connected');
    assert.equal(snapshot.poolMax, 10);
    assert.equal(snapshot.poolTotal, 4);
    assert.equal(snapshot.poolIdle, 3);
    assert.equal(snapshot.poolUnavailable, false);
    assert.equal(snapshot.warnLatencyMs, 250);
    assert.equal(snapshot.warnWaitingCount, 1);
    assert.equal(snapshot.warnUtilizationPercent, 90);
    assert.ok(typeof snapshot.latencyMs === 'number' && snapshot.latencyMs >= 0);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'log');
    const line = JSON.parse(logs[0].line) as Record<string, unknown>;
    assert.equal(line.event, 'postgres_pool_latency');
    assert.equal(line.level, 'log');
    assert.deepEqual(line.reasons, []);
  });

  it('warns on configured waiting and utilization thresholds', async (t) => {
    const { service, logs, restore } = createHarness({
      stats: { max: 10, total: 10, idle: 0, waiting: 2 },
      thresholds: {
        'database.metrics.warn_waiting_count': 1,
        'database.metrics.warn_utilization_percent': 50,
      },
    });
    t.after(restore);
    const snapshot = await service.reportMetrics();
    assert.ok(snapshot);
    assert.equal(snapshot.poolUtilizationPercent, 100);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'warn');
    const line = JSON.parse(logs[0].line) as { reasons: string[] };
    assert.deepEqual(line.reasons, ['pool_waiting', 'utilization']);
  });

  it('marks a failed SELECT 1 probe without throwing from the scheduler', async (t) => {
    const { service, logs, restore } = createHarness({
      query: async () => {
        throw new Error('database password=ci-secret is unavailable');
      },
    });
    t.after(restore);
    const snapshot = await service.reportMetrics();
    assert.ok(snapshot);
    assert.equal(snapshot.dbState, 'error');
    assert.equal(snapshot.latencyMs, null);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'warn');
    const line = JSON.parse(logs[0].line) as { reasons: string[] };
    assert.deepEqual(line.reasons, ['db_error']);
    assert.equal(logs[0].line.includes('ci-secret'), false);
  });

  it('reads pool counters after the database probe opens a connection', async (t) => {
    const originalGetStats = postgresPoolRegistry.getStats;
    let probed = false;
    postgresPoolRegistry.getStats = () => ({
      max: 10,
      total: probed ? 1 : 0,
      idle: probed ? 1 : 0,
      waiting: 0,
    });
    t.after(() => {
      postgresPoolRegistry.getStats = originalGetStats;
    });
    const prisma = {
      $queryRaw: async () => {
        probed = true;
        return [{ '?column?': 1 }];
      },
    } as unknown as PrismaService;
    const settings = {
      getNumberValue: async (_key: string, fallback: number): Promise<number> => fallback,
    } as unknown as SettingsService;
    const service = new PostgresMetricsService(prisma, settings);
    const snapshot = await service.collectMetrics();
    assert.equal(snapshot.poolTotal, 1);
    assert.equal(snapshot.poolIdle, 1);
    assert.equal(snapshot.poolUtilizationPercent, 10);
  });

  it('warns separately when the pool registry is unavailable', async (t) => {
    const { service, logs, restore } = createHarness({ stats: null });
    t.after(restore);
    const snapshot = await service.reportMetrics();
    assert.ok(snapshot);
    assert.equal(snapshot.poolUnavailable, true);
    assert.equal(snapshot.poolMax, 0);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'warn');
    const line = JSON.parse(logs[0].line) as { reasons: string[] };
    assert.deepEqual(line.reasons, ['pool_unavailable']);
  });
});
