import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { InventoryCloseMetricsService } from './inventory-close-metrics.service';
import { DEFAULT_INVENTORY_CLOSE_METRICS_THRESHOLDS } from './utils/inventory-close-metrics.util';

interface CapturedLog {
  level: 'log' | 'warn' | 'error';
  line: string;
}

interface RawGroup {
  status: 'queued' | 'running' | 'done' | 'failed';
  _count: { _all: number };
  _min: { createdAt: Date | null; startedAt: Date | null; updatedAt: Date | null };
}

const now = new Date('2026-10-27T10:00:00.000Z');
const secondsAgo = (seconds: number): Date => new Date(now.getTime() - seconds * 1_000);

const rawGroup = (
  status: RawGroup['status'],
  count: number,
  createdAt: Date | null = null,
  startedAt: Date | null = null,
  updatedAt: Date | null = null,
): RawGroup => ({
  status,
  _count: { _all: count },
  _min: { createdAt, startedAt, updatedAt },
});

const SETTING_KEYS = [
  'inventory.close.metrics.warn_pending_count',
  'inventory.close.metrics.warn_queued_age_seconds',
  'inventory.close.metrics.warn_running_age_seconds',
  'inventory.close.metrics.warn_failed_age_seconds',
];

const createHarness = (
  options: {
    groups?: RawGroup[];
    expiredLeaseCount?: number;
    values?: Record<string, number>;
    settingsError?: Error;
    dbError?: Error;
    blocked?: Promise<void>;
  } = {},
): {
  service: InventoryCloseMetricsService;
  logs: CapturedLog[];
  readKeys: string[];
  capturedGroupByArgs: unknown;
  capturedCountArgs: unknown;
} => {
  const readKeys: string[] = [];
  let capturedGroupByArgs: unknown = null;
  let capturedCountArgs: unknown = null;
  const prisma = {
    inventorySessionCloseJob: {
      groupBy: async (args: unknown): Promise<RawGroup[]> => {
        capturedGroupByArgs = args;
        if (options.dbError) throw options.dbError;
        return options.groups ?? [rawGroup('done', 4, secondsAgo(3_000))];
      },
      count: async (args: unknown): Promise<number> => {
        capturedCountArgs = args;
        if (options.dbError) throw options.dbError;
        return options.expiredLeaseCount ?? 0;
      },
    },
  } as unknown as PrismaService;
  const settings = {
    getNumberValue: async (key: string, fallback: number): Promise<number> => {
      readKeys.push(key);
      if (options.blocked) await options.blocked;
      if (options.settingsError) throw options.settingsError;
      return options.values?.[key] ?? fallback;
    },
  } as unknown as SettingsService;
  const service = new InventoryCloseMetricsService(prisma, settings);
  const logs: CapturedLog[] = [];
  (service as unknown as { logger: Record<string, (line: string) => void> }).logger = {
    log: (line: string) => logs.push({ level: 'log', line }),
    warn: (line: string) => logs.push({ level: 'warn', line }),
    error: (line: string) => logs.push({ level: 'error', line }),
  };
  return {
    service,
    logs,
    readKeys,
    get capturedGroupByArgs() {
      return capturedGroupByArgs;
    },
    get capturedCountArgs() {
      return capturedCountArgs;
    },
  };
};

const staleGroups = (): RawGroup[] => [
  rawGroup('queued', 9, secondsAgo(600)),
  rawGroup('running', 2, secondsAgo(4_000), secondsAgo(3_600)),
  rawGroup('failed', 1, secondsAgo(5_000), null, secondsAgo(900)),
  rawGroup('done', 12, secondsAgo(9_000)),
];

describe('InventoryCloseMetricsService', () => {
  it('collects DB aggregates with count/timestamp-only queries', async () => {
    const harness = createHarness({ groups: staleGroups(), expiredLeaseCount: 1 });
    const snapshot = await harness.service.collectMetrics(now);
    assert.equal(snapshot.queued, 9);
    assert.equal(snapshot.running, 2);
    assert.equal(snapshot.failed, 1);
    assert.equal(snapshot.done, 12);
    assert.equal(snapshot.pending, 11);
    assert.equal(snapshot.expiredLeaseCount, 1);
    assert.equal(snapshot.oldestQueuedAgeSeconds, 600);
    assert.equal(snapshot.oldestRunningAgeSeconds, 3_600);
    assert.equal(snapshot.oldestFailedAgeSeconds, 5_000);
    const groupByArgs = harness.capturedGroupByArgs as {
      by: string[];
      _count: { _all: boolean };
      _min: Record<string, boolean>;
    };
    assert.deepEqual(groupByArgs.by, ['status']);
    assert.deepEqual(groupByArgs._min, {
      createdAt: true,
      startedAt: true,
      updatedAt: true,
    });
    const countArgs = harness.capturedCountArgs as { where: { status: string } };
    assert.equal(countArgs.where.status, 'running');
    assert.ok(!JSON.stringify(groupByArgs).includes('sessionId'));
    assert.ok(!JSON.stringify(countArgs).includes('lastError'));
  });

  it('emits a quiet structured summary with default thresholds', async () => {
    const harness = createHarness();
    const snapshot = await harness.service.reportMetrics(now);
    assert.ok(snapshot);
    assert.deepEqual([...harness.readKeys].sort(), [...SETTING_KEYS].sort());
    assert.equal(harness.logs.length, 1);
    assert.equal(harness.logs[0].level, 'log');
    const line = JSON.parse(harness.logs[0].line) as Record<string, unknown>;
    assert.equal(line.event, 'inventory_close_job_metrics');
    assert.equal(line.level, 'log');
    assert.deepEqual(line.reasons, []);
    assert.equal(line.done, 4);
    assert.equal(line.pending, 0);
    assert.equal(line.warnPendingCount, DEFAULT_INVENTORY_CLOSE_METRICS_THRESHOLDS.warnPendingCount);
    assert.equal(line.warnQueuedAgeSeconds, 300);
  });

  it('warns with ordered reasons for stale, expired and unresolved jobs', async () => {
    const harness = createHarness({ groups: staleGroups(), expiredLeaseCount: 1 });
    const snapshot = await harness.service.reportMetrics(now);
    assert.ok(snapshot);
    assert.equal(harness.logs.length, 1);
    assert.equal(harness.logs[0].level, 'warn');
    const line = JSON.parse(harness.logs[0].line) as Record<string, unknown>;
    assert.deepEqual(line.reasons, [
      'pending_backlog',
      'queued_age',
      'running_age',
      'expired_lease',
      'failed_age',
    ]);
    assert.ok(!harness.logs[0].line.includes('session-'));
    assert.ok(!harness.logs[0].line.includes('lastError'));
  });

  it('uses configured thresholds from the settings store', async () => {
    const harness = createHarness({
      groups: [rawGroup('queued', 1, secondsAgo(50))],
      values: {
        'inventory.close.metrics.warn_pending_count': 1,
        'inventory.close.metrics.warn_queued_age_seconds': 40,
        'inventory.close.metrics.warn_running_age_seconds': 60,
        'inventory.close.metrics.warn_failed_age_seconds': 60,
      },
    });
    const snapshot = await harness.service.reportMetrics(now);
    assert.ok(snapshot);
    const line = JSON.parse(harness.logs[0].line) as Record<string, unknown>;
    assert.equal(line.warnPendingCount, 1);
    assert.equal(line.warnQueuedAgeSeconds, 40);
    assert.deepEqual(line.reasons, ['pending_backlog', 'queued_age']);
  });

  it('falls back to defaults when settings are invalid or unavailable', async () => {
    const invalid = createHarness({
      values: {
        'inventory.close.metrics.warn_pending_count': 0,
        'inventory.close.metrics.warn_queued_age_seconds': Number.NaN,
        'inventory.close.metrics.warn_running_age_seconds': -5,
        'inventory.close.metrics.warn_failed_age_seconds': Number.POSITIVE_INFINITY,
      },
    });
    const first = await invalid.service.reportMetrics(now);
    assert.ok(first);
    assert.equal(first.warnPendingCount, 10);
    assert.equal(first.warnQueuedAgeSeconds, 300);
    assert.equal(first.warnRunningAgeSeconds, 1_800);
    assert.equal(first.warnFailedAgeSeconds, 300);

    const broken = createHarness({
      settingsError: new Error('password=settings-secret unavailable'),
    });
    assert.ok(await broken.service.reportMetrics(now));
    const fallbacks = broken.logs.filter(({ line }) =>
      line.includes('inventory_close_metrics_setting_fallback'),
    );
    assert.equal(fallbacks.length, 4);
    for (const fallback of fallbacks) {
      assert.ok(!fallback.line.includes('settings-secret'));
      assert.ok(fallback.line.includes('[redacted]'));
    }
  });

  it('logs a redacted error when the DB aggregate query fails', async () => {
    const harness = createHarness({
      dbError: new Error('password=db-secret relation missing'),
    });
    const snapshot = await harness.service.reportMetrics(now);
    assert.equal(snapshot, null);
    assert.equal(harness.logs.length, 1);
    assert.equal(harness.logs[0].level, 'error');
    assert.ok(harness.logs[0].line.includes('inventory_close_job_metrics_error'));
    assert.ok(!harness.logs[0].line.includes('db-secret'));
  });

  it('does not run two reports at the same time', async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    const harness = createHarness({ blocked });
    const first = harness.service.reportMetrics(now);
    const overlapping = await harness.service.reportMetrics(now);
    assert.equal(overlapping, null);
    release?.();
    await first;
    assert.equal(
      harness.logs.filter(({ line }) => line.includes('inventory_close_job_metrics')).length,
      1,
    );
  });
});
