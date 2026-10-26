import assert from 'node:assert/strict';
import test from 'node:test';
import { QueueMetricsService } from './queue-metrics.service';
import {
  QUEUE_METRICS_WARN_ACTIVE_SECONDS,
  QUEUE_METRICS_WARN_BACKLOG_COUNT,
  QUEUE_METRICS_WARN_WAITING_SECONDS,
} from './utils/queue-metrics.util';

interface FakeJob {
  timestamp?: number;
  processedOn?: number;
}

interface QueueState {
  counts?: Record<string, number>;
  waitingJobs?: FakeJob[];
  activeJobs?: FakeJob[];
  throws?: boolean;
}

interface Harness {
  service: QueueMetricsService;
  logs: Array<{ level: 'log' | 'warn' | 'error'; line: string }>;
  getJobsCalls: unknown[];
  inventoryQueue: never;
  documentQueue: never;
}

const createQueue = (state: QueueState, getJobsCalls: unknown[]) =>
  ({
    getJobCounts: async () => {
      if (state.throws) throw new Error('Redis unavailable');
      return state.counts ?? {};
    },
    getJobs: async (types: string[], start: number, end: number, asc: boolean) => {
      getJobsCalls.push({ types, start, end, asc });
      if (state.throws) throw new Error('Redis unavailable');
      return types[0] === 'waiting' ? (state.waitingJobs ?? []) : (state.activeJobs ?? []);
    },
  }) as never;

const createHarness = (options: {
  inventory?: QueueState;
  document?: QueueState;
  settings?: Record<string, number>;
  settingsThrows?: boolean;
} = {}): Harness => {
  const logs: Array<{ level: 'log' | 'warn' | 'error'; line: string }> = [];
  const getJobsCalls: unknown[] = [];
  const settings = {
    getNumberValue: async (key: string, defaultValue: number) => {
      if (options.settingsThrows) throw new Error('settings unavailable');
      return options.settings?.[key] ?? defaultValue;
    },
  };
  const inventoryQueue = createQueue(options.inventory ?? {}, getJobsCalls);
  const documentQueue = createQueue(options.document ?? {}, getJobsCalls);
  const service = new QueueMetricsService(inventoryQueue, documentQueue, settings as never);
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
  return { service, logs, getJobsCalls, inventoryQueue, documentQueue };
};

test('collects BullMQ depth, oldest waiting lag and oldest active duration', async () => {
  const now = new Date('2026-10-26T12:00:00.000Z');
  const { service, getJobsCalls, inventoryQueue } = createHarness({
    inventory: {
      counts: { waiting: 2, active: 1, delayed: 3, failed: 4 },
      waitingJobs: [{ timestamp: now.getTime() - 30_000 }],
      activeJobs: [{ timestamp: now.getTime() - 120_000, processedOn: now.getTime() - 90_000 }],
    },
    settings: {
      'queues.metrics.warn_backlog_count': 10,
      'queues.metrics.warn_waiting_seconds': 60,
      'queues.metrics.warn_active_seconds': 120,
    },
  });

  const metrics = await service.collectQueueMetrics('inventory-close', inventoryQueue, now);

  assert.deepEqual(metrics, {
    queue: 'inventory-close',
    waiting: 2,
    active: 1,
    delayed: 3,
    failed: 4,
    backlog: 6,
    oldestWaitingAgeSeconds: 30,
    oldestActiveAgeSeconds: 90,
    backlogWarnThreshold: 10,
    waitingWarnThresholdSeconds: 60,
    activeWarnThresholdSeconds: 120,
  });
  assert.equal(getJobsCalls.length, 2);
});

test('healthy queues emit one routine metric line each', async () => {
  const { service, logs, getJobsCalls } = createHarness({
    inventory: { counts: { waiting: 0, active: 0, delayed: 0, failed: 0 } },
    document: { counts: { waiting: 1, active: 0, delayed: 0, failed: 0 }, waitingJobs: [{ timestamp: Date.now() }] },
  });

  await service.reportMetrics();

  assert.equal(logs.length, 2);
  assert.ok(logs.every((entry) => entry.level === 'log'));
  const queues = logs.map((entry) => (JSON.parse(entry.line) as { queue: string }).queue);
  assert.deepEqual(new Set(queues), new Set(['inventory-session-close', 'document-generation']));
  assert.deepEqual(getJobsCalls.slice(0, 2), [
    { types: ['waiting'], start: 0, end: 0, asc: true },
    { types: ['active'], start: 0, end: 0, asc: true },
  ]);
});

test('threshold breach emits a warn-level metric with all three reasons', async () => {
  const { service, logs } = createHarness({
    inventory: {
      counts: { waiting: 40, active: 10, delayed: 5, failed: 2 },
      waitingJobs: [{ timestamp: Date.now() - 400_000 }],
      activeJobs: [{ processedOn: Date.now() - 2_000_000 }],
    },
    document: { counts: { waiting: 0, active: 0, delayed: 0, failed: 0 } },
    settings: {
      'queues.metrics.warn_backlog_count': 5,
      'queues.metrics.warn_waiting_seconds': 60,
      'queues.metrics.warn_active_seconds': 120,
    },
  });

  await service.reportMetrics();

  const inventoryLine = logs
    .map((entry) => ({ level: entry.level, payload: JSON.parse(entry.line) as Record<string, unknown> }))
    .find((entry) => entry.payload.queue === 'inventory-session-close');
  assert.equal(inventoryLine?.level, 'warn');
  assert.deepEqual(inventoryLine?.payload.reasons, ['backlog', 'waiting_age', 'active_age']);
});

test('settings outage or invalid values fall back to safe defaults', async () => {
  const outage = createHarness({ settingsThrows: true });
  const metrics = await outage.service.collectQueueMetrics(
    'document-generation',
    outage.documentQueue,
    new Date('2026-10-26T12:00:00.000Z'),
  );
  assert.equal(metrics.backlogWarnThreshold, QUEUE_METRICS_WARN_BACKLOG_COUNT);
  assert.equal(metrics.waitingWarnThresholdSeconds, QUEUE_METRICS_WARN_WAITING_SECONDS);
  assert.equal(metrics.activeWarnThresholdSeconds, QUEUE_METRICS_WARN_ACTIVE_SECONDS);

  const invalid = createHarness({
    settings: {
      'queues.metrics.warn_backlog_count': 0,
      'queues.metrics.warn_waiting_seconds': Number.NaN,
      'queues.metrics.warn_active_seconds': -1,
    },
  });
  const invalidMetrics = await invalid.service.collectQueueMetrics(
    'document-generation',
    invalid.documentQueue,
  );
  assert.equal(invalidMetrics.backlogWarnThreshold, QUEUE_METRICS_WARN_BACKLOG_COUNT);
  assert.equal(invalidMetrics.waitingWarnThresholdSeconds, QUEUE_METRICS_WARN_WAITING_SECONDS);
  assert.equal(invalidMetrics.activeWarnThresholdSeconds, QUEUE_METRICS_WARN_ACTIVE_SECONDS);
});

test('Redis failure is contained per queue and logged without crashing the scheduler', async () => {
  const { service, logs } = createHarness({
    inventory: { throws: true },
    document: { counts: { waiting: 0, active: 0, delayed: 0, failed: 0 } },
  });

  await assert.doesNotReject(service.reportMetrics());

  assert.equal(logs.length, 2);
  const error = logs.find((entry) => entry.level === 'error');
  assert.ok(error);
  assert.equal((JSON.parse(error.line) as { event: string }).event, 'bullmq_queue_metrics_error');
  assert.ok(logs.some((entry) => entry.level === 'log'));
});
