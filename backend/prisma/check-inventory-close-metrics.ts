import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaService } from '../src/prisma/prisma.service';
import { InventoryCloseMetricsService } from '../src/modules/health/inventory-close-metrics.service';
import { evaluateInventoryCloseMetrics } from '../src/modules/health/utils/inventory-close-metrics.util';
import { SETTINGS_REGISTRY } from '../src/modules/settings/settings.registry';
import type { SettingsService } from '../src/modules/settings/settings.service';

interface CapturedLog {
  level: 'log' | 'warn' | 'error';
  line: string;
}

type CloseStatus = 'queued' | 'running' | 'done' | 'failed';

interface JobSeed {
  status: CloseStatus;
  ageSeconds: number;
  startedAgoSeconds?: number;
  leaseInSeconds?: number;
}

const assertTestDatabase = (): void => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ''));
  if (
    process.env.NODE_ENV !== 'test' ||
    !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
    databaseName !== 'inventory_ci'
  ) {
    throw new Error(
      'Inventory close metrics integration check is restricted to the local inventory_ci test database',
    );
  }
};

const createService = (
  prisma: PrismaService,
  values: Record<string, number> = {},
): { service: InventoryCloseMetricsService; logs: CapturedLog[] } => {
  const settings = {
    getNumberValue: async (key: string, fallback: number): Promise<number> =>
      values[key] ?? fallback,
  } as unknown as SettingsService;
  const service = new InventoryCloseMetricsService(prisma, settings);
  const logs: CapturedLog[] = [];
  (service as unknown as { logger: Record<string, (line: string) => void> }).logger = {
    log: (line: string) => logs.push({ level: 'log', line }),
    warn: (line: string) => logs.push({ level: 'warn', line }),
    error: (line: string) => logs.push({ level: 'error', line }),
  };
  return { service, logs };
};

const main = async (): Promise<void> => {
  assertTestDatabase();
  const prisma = new PrismaService();
  const orgUnitId = randomUUID();
  const sessionIds: string[] = [];
  let expiredLeaseSessionId = '';
  let connected = false;

  const seeds: JobSeed[] = [
    ...Array.from({ length: 10 }, () => ({ status: 'queued' as const, ageSeconds: 610 })),
    { status: 'running', ageSeconds: 4_000, startedAgoSeconds: 3_700, leaseInSeconds: -120 },
    { status: 'running', ageSeconds: 5, startedAgoSeconds: 4, leaseInSeconds: 600 },
    { status: 'failed', ageSeconds: 950 },
    { status: 'done', ageSeconds: 9_000 },
  ];

  try {
    await prisma.$connect();
    connected = true;
    const now = new Date();
    const ago = (seconds: number): Date => new Date(now.getTime() - seconds * 1_000);

    await prisma.orgUnit.create({
      data: { id: orgUnitId, name: `CI close metrics ${orgUnitId}`, type: 'direkcija' },
    });

    // Other CI steps clean up after themselves, but deltas keep this check
    // deterministic even if a prior crash-recovery step left a job behind.
    const { service, logs } = createService(prisma);
    const baseline = await service.collectMetrics(now);

    for (const [index, seed] of seeds.entries()) {
      const sessionId = randomUUID();
      sessionIds.push(sessionId);
      await prisma.inventorySession.create({
        data: {
          id: sessionId,
          name: `CI close metrics session ${index}`,
          orgUnitId,
          year: 2_300 + index,
          status: 'closing',
        },
      });
      const createdAt = ago(seed.ageSeconds);
      await prisma.inventorySessionCloseJob.create({
        data: {
          sessionId,
          status: seed.status,
          createdAt,
          updatedAt: createdAt,
          startedAt:
            seed.startedAgoSeconds === undefined ? null : ago(seed.startedAgoSeconds),
          leaseUntil:
            seed.leaseInSeconds === undefined
              ? null
              : new Date(now.getTime() + seed.leaseInSeconds * 1_000),
          lastError: seed.status === 'failed' ? 'CI synthetic failure' : null,
        },
      });
      if (seed.status === 'running' && (seed.leaseInSeconds ?? 0) < 0) {
        expiredLeaseSessionId = sessionId;
      }
    }

    const snapshot = await service.reportMetrics();
    assert.ok(snapshot, 'reportMetrics must return a snapshot');
    assert.equal(snapshot.queued - baseline.queued, 10);
    assert.equal(snapshot.running - baseline.running, 2);
    assert.equal(snapshot.failed - baseline.failed, 1);
    assert.equal(snapshot.done - baseline.done, 1);
    assert.equal(snapshot.pending - baseline.pending, 12);
    assert.equal(snapshot.expiredLeaseCount - baseline.expiredLeaseCount, 1);
    assert.ok(snapshot.oldestQueuedAgeSeconds >= 600);
    assert.ok(snapshot.oldestRunningAgeSeconds >= 3_600);
    assert.ok(snapshot.oldestFailedAgeSeconds >= 900);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'warn');

    const line = JSON.parse(logs[0].line) as Record<string, unknown>;
    assert.equal(line.event, 'inventory_close_job_metrics');
    assert.equal(line.level, 'warn');
    assert.deepEqual(line.reasons, [
      'pending_backlog',
      'queued_age',
      'running_age',
      'expired_lease',
      'failed_age',
    ]);
    assert.equal(line.warnPendingCount, 10);
    assert.equal(line.warnQueuedAgeSeconds, 300);
    assert.equal(line.warnRunningAgeSeconds, 1_800);
    assert.equal(line.warnFailedAgeSeconds, 300);
    assert.deepEqual(evaluateInventoryCloseMetrics(snapshot).reasons, line.reasons);
    for (const sessionId of sessionIds) {
      assert.ok(!logs[0].line.includes(sessionId), 'no session IDs in the metrics line');
    }
    assert.ok(!logs[0].line.includes('CI synthetic failure'));

    // Repairing the expired lease and relaxing the thresholds must make the
    // next report quiet: the signal reflects the current DB state, not a latch.
    await prisma.inventorySessionCloseJob.update({
      where: { sessionId: expiredLeaseSessionId },
      data: { leaseUntil: new Date(now.getTime() + 600_000) },
    });
    const quiet = createService(prisma, {
      'inventory.close.metrics.warn_pending_count': 10_000,
      'inventory.close.metrics.warn_queued_age_seconds': 86_400,
      'inventory.close.metrics.warn_running_age_seconds': 86_400,
      'inventory.close.metrics.warn_failed_age_seconds': 86_400,
    });
    const quietSnapshot = await quiet.service.reportMetrics();
    assert.ok(quietSnapshot);
    assert.equal(quietSnapshot.expiredLeaseCount, snapshot.expiredLeaseCount - 1);
    assert.equal(quiet.logs.length, 1);
    const quietReasons = JSON.parse(quiet.logs[0].line).reasons as string[];
    for (const reason of ['pending_backlog', 'queued_age', 'running_age', 'failed_age']) {
      assert.ok(!quietReasons.includes(reason), `${reason} must clear after repair`);
    }
    if (baseline.expiredLeaseCount === 0) {
      assert.equal(quiet.logs[0].level, 'log');
      assert.deepEqual(quietReasons, []);
    }

    // Configuration wiring: health module schedules the reporter and each
    // threshold has a validated private default in the settings registry.
    const healthModuleSource = readFileSync(
      resolve('src/modules/health/health.module.ts'),
      'utf8',
    );
    assert.ok(healthModuleSource.includes('InventoryCloseMetricsService'));
    const registrySource = readFileSync(
      resolve('src/modules/settings/settings.registry.ts'),
      'utf8',
    );
    const expectedSettings: Record<string, number> = {
      'inventory.close.metrics.warn_pending_count': 10,
      'inventory.close.metrics.warn_queued_age_seconds': 300,
      'inventory.close.metrics.warn_running_age_seconds': 1_800,
      'inventory.close.metrics.warn_failed_age_seconds': 300,
    };
    for (const [key, defaultValue] of Object.entries(expectedSettings)) {
      const definition = SETTINGS_REGISTRY.find((entry) => entry.key === key);
      assert.ok(definition, `missing setting definition: ${key}`);
      assert.equal(definition.defaultValue, defaultValue);
      assert.equal(definition.valueType, 'number');
      assert.equal(definition.scope, 'private');
      assert.ok(registrySource.includes(`key: '${key}'`));
    }

    console.log(
      `Verified inventory close job metrics: queued=${snapshot.queued}, ` +
        `running=${snapshot.running}, failed=${snapshot.failed}, ` +
        `expiredLeases=${snapshot.expiredLeaseCount}, level=${logs[0].level}.`,
    );
  } finally {
    try {
      if (connected) {
        await prisma.inventorySessionCloseJob.deleteMany({
          where: { sessionId: { in: sessionIds } },
        });
        await prisma.inventorySession.deleteMany({ where: { id: { in: sessionIds } } });
        await prisma.orgUnit.deleteMany({ where: { id: orgUnitId } });
      }
    } finally {
      if (connected) await prisma.$disconnect();
    }
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
