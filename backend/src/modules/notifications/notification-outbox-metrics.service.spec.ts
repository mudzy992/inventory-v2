import assert from 'node:assert/strict';
import test from 'node:test';
import { NotificationOutboxMetricsService } from './notification-outbox-metrics.service';
import {
  NOTIFICATION_OUTBOX_WARN_AGE_SECONDS,
  NOTIFICATION_OUTBOX_WARN_BACKLOG_COUNT,
} from './utils/notification-outbox-metrics.util';

interface HarnessOptions {
  pending?: number;
  running?: number;
  oldest?: { createdAt: Date; status: string; attempts: number } | null;
  settings?: Record<string, number>;
  settingsThrows?: boolean;
  countThrows?: boolean;
}

interface Harness {
  service: NotificationOutboxMetricsService;
  logs: Array<{ level: 'log' | 'warn' | 'error'; line: string }>;
  countQueries: unknown[];
}

const createHarness = (options: HarnessOptions = {}): Harness => {
  const logs: Array<{ level: 'log' | 'warn' | 'error'; line: string }> = [];
  const countQueries: unknown[] = [];
  const prisma = {
    notificationOutbox: {
      count: async (args: unknown) => {
        countQueries.push(args);
        if (options.countThrows) throw new Error('DB unavailable');
        const where = (args as { where: { status: string } }).where;
        return where.status === 'pending' ? (options.pending ?? 0) : (options.running ?? 0);
      },
      findFirst: async () =>
        options.oldest === undefined
          ? { createdAt: new Date('2026-10-26T12:00:00.000Z'), status: 'pending', attempts: 1 }
          : options.oldest,
    },
  };
  const settings = {
    getNumberValue: async (key: string, defaultValue: number) => {
      if (options.settingsThrows) throw new Error('settings unavailable');
      return options.settings?.[key] ?? defaultValue;
    },
  };
  const service = new NotificationOutboxMetricsService(prisma as never, settings as never);
  const internals = service as unknown as {
    logger: {
      log: (line: string) => void;
      warn: (line: string) => void;
      error: (line: string) => void;
    };
  };
  internals.logger = {
    log: (line) => logs.push({ level: 'log', line }),
    warn: (line) => logs.push({ level: 'warn', line }),
    error: (line) => logs.push({ level: 'error', line }),
  };
  return { service, logs, countQueries };
};

test('collects outbox backlog counts, oldest age and configured thresholds', async () => {
  const { service, countQueries } = createHarness({
    pending: 3,
    running: 2,
    settings: {
      'notifications.outbox.warn_backlog_count': 7,
      'notifications.outbox.warn_age_seconds': 60,
    },
  });

  const metrics = await service.collectMetrics(new Date('2026-10-26T12:00:25.000Z'));

  assert.deepEqual(metrics, {
    pending: 3,
    running: 2,
    backlog: 5,
    oldestUndeliveredAgeSeconds: 25,
    oldestStatus: 'pending',
    oldestAttempts: 1,
    backlogWarnThreshold: 7,
    ageWarnThresholdSeconds: 60,
  });
  assert.deepEqual(countQueries, [
    { where: { status: 'pending' } },
    { where: { status: 'running' } },
  ]);
});

test('settings outage or invalid values fall back to safe defaults', async () => {
  const outage = createHarness({ settingsThrows: true, oldest: null });
  const outageMetrics = await outage.service.collectMetrics(new Date('2026-10-26T12:00:00.000Z'));
  assert.equal(outageMetrics.backlogWarnThreshold, NOTIFICATION_OUTBOX_WARN_BACKLOG_COUNT);
  assert.equal(outageMetrics.ageWarnThresholdSeconds, NOTIFICATION_OUTBOX_WARN_AGE_SECONDS);
  assert.equal(outageMetrics.oldestStatus, null);
  assert.equal(outageMetrics.oldestAttempts, null);
  assert.equal(outageMetrics.oldestUndeliveredAgeSeconds, 0);

  const invalid = createHarness({
    settings: {
      'notifications.outbox.warn_backlog_count': 0,
      'notifications.outbox.warn_age_seconds': Number.NaN,
    },
    oldest: null,
  });
  const invalidMetrics = await invalid.service.collectMetrics();
  assert.equal(invalidMetrics.backlogWarnThreshold, NOTIFICATION_OUTBOX_WARN_BACKLOG_COUNT);
  assert.equal(invalidMetrics.ageWarnThresholdSeconds, NOTIFICATION_OUTBOX_WARN_AGE_SECONDS);
});

test('healthy backlog emits a routine structured metric line', async () => {
  const { service, logs } = createHarness({
    pending: 1,
    running: 0,
    oldest: null,
    settings: {
      'notifications.outbox.warn_backlog_count': 10,
      'notifications.outbox.warn_age_seconds': 600,
    },
  });

  await service.reportMetrics();

  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.level, 'log');
  const payload = JSON.parse(logs[0]?.line ?? '{}') as Record<string, unknown>;
  assert.equal(payload.event, 'notification_outbox_backlog');
  assert.equal(payload.backlog, 1);
  assert.deepEqual(payload.reasons, []);
});

test('threshold breach emits a warn-level metric with both reasons', async () => {
  const { service, logs } = createHarness({
    pending: 8,
    running: 2,
    oldest: { createdAt: new Date(Date.now() - 120_000), status: 'running', attempts: 4 },
    settings: {
      'notifications.outbox.warn_backlog_count': 5,
      'notifications.outbox.warn_age_seconds': 60,
    },
  });

  await service.reportMetrics();

  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.level, 'warn');
  const payload = JSON.parse(logs[0]?.line ?? '{}') as Record<string, unknown>;
  assert.equal(payload.event, 'notification_outbox_backlog');
  assert.equal(payload.backlog, 10);
  assert.equal(payload.oldestStatus, 'running');
  assert.equal(payload.oldestAttempts, 4);
  assert.deepEqual(payload.reasons, ['backlog', 'oldest_age']);
});

test('database outage is contained and logged without crashing the scheduler', async () => {
  const { service, logs } = createHarness({ countThrows: true });

  await assert.doesNotReject(service.reportMetrics());

  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.level, 'error');
  assert.match(logs[0]?.line ?? '', /collection failed/);
});
