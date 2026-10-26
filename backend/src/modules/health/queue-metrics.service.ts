import { Inject, forwardRef, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { DOCUMENT_GENERATION_QUEUE } from '../documents/document-generation.queue';
import { INVENTORY_SESSION_CLOSE_QUEUE } from '../inventory-count/inventory-session-close.queue';
import { SettingsService } from '../settings/settings.service';
import {
  ageSecondsFromTimestamp,
  evaluateQueueMetrics,
  QUEUE_METRICS_INTERVAL_MS,
  QUEUE_METRICS_WARN_ACTIVE_SECONDS,
  QUEUE_METRICS_WARN_BACKLOG_COUNT,
  QUEUE_METRICS_WARN_WAITING_SECONDS,
  type QueueMetricsSnapshot,
  type QueueMetricsThresholds,
} from './utils/queue-metrics.util';

const BACKLOG_THRESHOLD_SETTING = 'queues.metrics.warn_backlog_count';
const WAITING_THRESHOLD_SETTING = 'queues.metrics.warn_waiting_seconds';
const ACTIVE_THRESHOLD_SETTING = 'queues.metrics.warn_active_seconds';

/**
 * Log-based BullMQ depth/lag signal. Uses the two business-critical queues;
 * job payloads are never read, only counts and job timestamps.
 */
@Injectable()
export class QueueMetricsService {
  private readonly logger = new Logger(QueueMetricsService.name);
  private active = false;

  constructor(
    @InjectQueue(INVENTORY_SESSION_CLOSE_QUEUE)
    private readonly inventoryCloseQueue: Queue,
    @InjectQueue(DOCUMENT_GENERATION_QUEUE)
    private readonly documentGenerationQueue: Queue,
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService: SettingsService,
  ) {}

  @Interval(QUEUE_METRICS_INTERVAL_MS)
  async reportMetrics(): Promise<void> {
    if (this.active) return;
    this.active = true;
    try {
      const thresholds = await this.readThresholds();
      const now = new Date();
      const queues: Array<{ name: string; queue: Queue }> = [
        { name: INVENTORY_SESSION_CLOSE_QUEUE, queue: this.inventoryCloseQueue },
        { name: DOCUMENT_GENERATION_QUEUE, queue: this.documentGenerationQueue },
      ];
      for (const { name, queue } of queues) {
        try {
          const snapshot = await this.collectQueueMetrics(name, queue, now, thresholds);
          const evaluation = evaluateQueueMetrics(snapshot);
          const line = JSON.stringify({
            event: 'bullmq_queue_metrics',
            ...snapshot,
            reasons: evaluation.reasons,
          });
          if (evaluation.level === 'warn') {
            this.logger.warn(line);
          } else {
            this.logger.log(line);
          }
        } catch (error) {
          this.logger.error(
            JSON.stringify({
              event: 'bullmq_queue_metrics_error',
              queue: name,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      }
    } finally {
      this.active = false;
    }
  }

  async collectQueueMetrics(
    queueName: string,
    queue: Queue,
    now = new Date(),
    thresholds?: QueueMetricsThresholds,
  ): Promise<QueueMetricsSnapshot> {
    const resolvedThresholds = thresholds ?? (await this.readThresholds());
    const [counts, oldestWaitingJobs, oldestActiveJobs] = await Promise.all([
      queue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
      queue.getJobs(['waiting'], 0, 0, true),
      queue.getJobs(['active'], 0, 0, true),
    ]);
    const waiting = counts.waiting ?? 0;
    const active = counts.active ?? 0;
    const delayed = counts.delayed ?? 0;
    const failed = counts.failed ?? 0;
    const oldestWaiting = oldestWaitingJobs[0];
    const oldestActive = oldestActiveJobs[0];
    return {
      queue: queueName,
      waiting,
      active,
      delayed,
      failed,
      backlog: waiting + delayed + active,
      oldestWaitingAgeSeconds: ageSecondsFromTimestamp(oldestWaiting?.timestamp, now),
      oldestActiveAgeSeconds: ageSecondsFromTimestamp(
        oldestActive?.processedOn || oldestActive?.timestamp,
        now,
      ),
      ...resolvedThresholds,
    };
  }

  private async readThresholds(): Promise<QueueMetricsThresholds> {
    const [backlogWarnThreshold, waitingWarnThresholdSeconds, activeWarnThresholdSeconds] =
      await Promise.all([
        this.readNumberSetting(BACKLOG_THRESHOLD_SETTING, QUEUE_METRICS_WARN_BACKLOG_COUNT),
        this.readNumberSetting(WAITING_THRESHOLD_SETTING, QUEUE_METRICS_WARN_WAITING_SECONDS),
        this.readNumberSetting(ACTIVE_THRESHOLD_SETTING, QUEUE_METRICS_WARN_ACTIVE_SECONDS),
      ]);
    return { backlogWarnThreshold, waitingWarnThresholdSeconds, activeWarnThresholdSeconds };
  }

  private async readNumberSetting(key: string, defaultValue: number): Promise<number> {
    try {
      const value = await this.settingsService.getNumberValue(key, defaultValue);
      return Number.isFinite(value) && value > 0 ? value : defaultValue;
    } catch {
      return defaultValue;
    }
  }
}
