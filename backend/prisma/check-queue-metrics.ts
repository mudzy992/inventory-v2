import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import { QueueMetricsService } from '../src/modules/health/queue-metrics.service';
import {
  evaluateQueueMetrics,
  QUEUE_METRICS_WARN_ACTIVE_SECONDS,
  QUEUE_METRICS_WARN_BACKLOG_COUNT,
  QUEUE_METRICS_WARN_WAITING_SECONDS,
} from '../src/modules/health/utils/queue-metrics.util';
import { buildBaseRedisOptions, readRedisConfig } from '../src/redis/redis.config';

const assertTestRedis = (): void => {
  const config = readRedisConfig();
  if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(config.host)) {
    throw new Error('Queue metrics check is restricted to the local test Redis');
  }
};

const withTimeout = async <T>(promise: Promise<T>, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 10_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const watchdog = setTimeout(() => {
  console.error('Queue metrics check exceeded its 60 second watchdog');
  process.exit(1);
}, 60_000);
watchdog.unref();

const main = async (): Promise<void> => {
  assertTestRedis();
  const config = readRedisConfig();
  const options = {
    connection: buildBaseRedisOptions(config),
    prefix: config.keyPrefix.replace(/:$/, ''),
  };
  const queueName = `ci-queue-metrics-${randomUUID()}`;
  const queue = new Queue(queueName, options);
  let worker: Worker | undefined;
  let releaseProcessor: (() => void) | undefined;
  let signalStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const processorGate = new Promise<void>((resolve) => {
    releaseProcessor = resolve;
  });

  try {
    await withTimeout(queue.waitUntilReady(), 'Redis queue readiness');
    let completedCount = 0;
    let signalAllCompleted: (() => void) | undefined;
    const allCompleted = new Promise<void>((resolve) => {
      signalAllCompleted = resolve;
    });
    worker = new Worker(
      queueName,
      async (job) => {
        if (job.id === 'active-job') {
          signalStarted?.();
          await processorGate;
        }
        return { jobId: job.id };
      },
      options,
    );
    worker.on('completed', () => {
      completedCount += 1;
      if (completedCount >= 3) signalAllCompleted?.();
    });
    await withTimeout(worker.waitUntilReady(), 'worker readiness');

    await queue.add('metrics-active', { kind: 'active' }, { jobId: 'active-job', attempts: 1 });
    await withTimeout(started, 'worker activation');
    await queue.add('metrics-waiting-1', { kind: 'waiting' }, { jobId: 'waiting-1', attempts: 1 });
    await queue.add('metrics-waiting-2', { kind: 'waiting' }, { jobId: 'waiting-2', attempts: 1 });
    await queue.add(
      'metrics-delayed',
      { kind: 'delayed' },
      { jobId: 'delayed-1', attempts: 1, delay: 60_000 },
    );

    const settings = {
      getNumberValue: async (_key: string, defaultValue: number) => defaultValue,
    };
    const service = new QueueMetricsService(queue, queue, settings as never);
    const metrics = await service.collectQueueMetrics(queueName, queue, new Date());

    assert.equal(metrics.queue, queueName);
    assert.equal(metrics.waiting, 2);
    assert.equal(metrics.active, 1);
    assert.equal(metrics.delayed, 1);
    assert.equal(metrics.failed, 0);
    assert.equal(metrics.backlog, 4);
    assert.ok(metrics.oldestWaitingAgeSeconds >= 0);
    assert.ok(metrics.oldestActiveAgeSeconds >= 0);
    assert.ok(metrics.oldestWaitingAgeSeconds < 60);
    assert.ok(metrics.oldestActiveAgeSeconds < 60);
    assert.equal(metrics.backlogWarnThreshold, QUEUE_METRICS_WARN_BACKLOG_COUNT);
    assert.equal(metrics.waitingWarnThresholdSeconds, QUEUE_METRICS_WARN_WAITING_SECONDS);
    assert.equal(metrics.activeWarnThresholdSeconds, QUEUE_METRICS_WARN_ACTIVE_SECONDS);

    const lowThresholdEvaluation = evaluateQueueMetrics({
      ...metrics,
      backlogWarnThreshold: 1,
      waitingWarnThresholdSeconds: 1,
      activeWarnThresholdSeconds: 1,
      oldestWaitingAgeSeconds: 10,
      oldestActiveAgeSeconds: 10,
    });
    assert.deepEqual(lowThresholdEvaluation, {
      level: 'warn',
      reasons: ['backlog', 'waiting_age', 'active_age'],
    });

    const logs: string[] = [];
    const internals = service as unknown as {
      logger: { log: (line: string) => void; warn: (line: string) => void; error: (line: string) => void };
    };
    internals.logger = {
      log: (line) => logs.push(line),
      warn: (line) => logs.push(line),
      error: (line) => logs.push(line),
    };
    await service.reportMetrics();
    assert.equal(logs.length, 2, 'both critical queues must emit one metric line');
    const parsed = logs.map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.deepEqual(
      new Set(parsed.map((line) => line.queue)),
      new Set(['inventory-session-close', 'document-generation']),
    );
    assert.ok(parsed.every((line) => line.event === 'bullmq_queue_metrics'));

    releaseProcessor?.();
    await withTimeout(allCompleted, 'worker completion for non-delayed jobs');
    await worker.close();
    worker = undefined;

    console.log('Verified BullMQ depth, waiting lag and active duration metrics against live Redis.');
  } finally {
    clearTimeout(watchdog);
    releaseProcessor?.();
    try {
      await worker?.close(true);
    } catch {
      // Cleanup best-effort; the queue is obliterated below.
    }
    try {
      await queue.drain(true);
      await queue.obliterate({ force: true });
      await queue.close();
    } catch {
      // Ignore cleanup errors after assertions have already reported the real failure.
    }
  }
};

void main().catch((error: unknown) => {
  clearTimeout(watchdog);
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(error);
  console.log(`::error title=BullMQ queue metrics::${message.replaceAll('%', '%25').replaceAll(/[\r\n]/gu, ' ')}`);
  process.exitCode = 1;
});
