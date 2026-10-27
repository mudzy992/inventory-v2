import { Inject, forwardRef, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { redactSensitiveText } from '../../common/utils/redact-log.util';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  buildInventoryCloseMetricsSnapshot,
  DEFAULT_INVENTORY_CLOSE_METRICS_THRESHOLDS,
  evaluateInventoryCloseMetrics,
  INVENTORY_CLOSE_METRICS_INTERVAL_MS,
  type InventoryCloseMetricsSnapshot,
  type InventoryCloseMetricsThresholds,
  type InventoryCloseStatusGroup,
} from './utils/inventory-close-metrics.util';

const PENDING_COUNT_SETTING = 'inventory.close.metrics.warn_pending_count';
const QUEUED_AGE_SETTING = 'inventory.close.metrics.warn_queued_age_seconds';
const RUNNING_AGE_SETTING = 'inventory.close.metrics.warn_running_age_seconds';
const FAILED_AGE_SETTING = 'inventory.close.metrics.warn_failed_age_seconds';

/**
 * DB-backed age/status signal for inventory close jobs. BullMQ queue metrics
 * only see the queue; a job can be stuck in the DB as `queued`/`running` with
 * an expired lease, or remain `failed` without an admin retry. This periodic
 * signal reads aggregated counts/timestamps only — no business data.
 */
@Injectable()
export class InventoryCloseMetricsService {
  private readonly logger = new Logger(InventoryCloseMetricsService.name);
  private active = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService: SettingsService,
  ) {}

  @Interval(INVENTORY_CLOSE_METRICS_INTERVAL_MS)
  async reportMetrics(now: Date = new Date()): Promise<InventoryCloseMetricsSnapshot | null> {
    if (this.active) return null;
    this.active = true;
    try {
      const thresholds = await this.readThresholds();
      const snapshot = await this.collectMetrics(now, thresholds);
      const evaluation = evaluateInventoryCloseMetrics(snapshot);
      const line = JSON.stringify({
        event: 'inventory_close_job_metrics',
        ...snapshot,
        level: evaluation.level,
        reasons: evaluation.reasons,
      });
      if (evaluation.level === 'warn') {
        this.logger.warn(line);
      } else {
        this.logger.log(line);
      }
      return snapshot;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'inventory_close_job_metrics_error',
          error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
        }),
      );
      return null;
    } finally {
      this.active = false;
    }
  }

  async collectMetrics(
    now: Date = new Date(),
    thresholds: InventoryCloseMetricsThresholds = DEFAULT_INVENTORY_CLOSE_METRICS_THRESHOLDS,
  ): Promise<InventoryCloseMetricsSnapshot> {
    const [groups, expiredLeaseCount] = await Promise.all([
      this.prisma.inventorySessionCloseJob.groupBy({
        by: ['status'],
        _count: { _all: true },
        _min: { createdAt: true, startedAt: true, updatedAt: true },
      }),
      this.prisma.inventorySessionCloseJob.count({
        where: { status: 'running', leaseUntil: { lt: now } },
      }),
    ]);

    const safeGroups: InventoryCloseStatusGroup[] = groups.map((group) => ({
      status: group.status,
      count: group._count._all,
      oldestCreatedAt: group._min.createdAt,
      oldestStartedAt: group._min.startedAt,
      oldestUpdatedAt: group._min.updatedAt,
    }));

    return buildInventoryCloseMetricsSnapshot({
      groups: safeGroups,
      expiredLeaseCount,
      now,
      thresholds,
    });
  }

  private async readThresholds(): Promise<InventoryCloseMetricsThresholds> {
    const readNumber = async (key: string, fallback: number): Promise<number> => {
      try {
        const value = await this.settingsService.getNumberValue(key, fallback);
        return typeof value === 'number' && Number.isFinite(value) && value > 0
          ? value
          : fallback;
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            event: 'inventory_close_metrics_setting_fallback',
            key,
            error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
          }),
        );
        return fallback;
      }
    };
    const defaults = DEFAULT_INVENTORY_CLOSE_METRICS_THRESHOLDS;
    const [warnPendingCount, warnQueuedAgeSeconds, warnRunningAgeSeconds, warnFailedAgeSeconds] =
      await Promise.all([
        readNumber(PENDING_COUNT_SETTING, defaults.warnPendingCount),
        readNumber(QUEUED_AGE_SETTING, defaults.warnQueuedAgeSeconds),
        readNumber(RUNNING_AGE_SETTING, defaults.warnRunningAgeSeconds),
        readNumber(FAILED_AGE_SETTING, defaults.warnFailedAgeSeconds),
      ]);
    return {
      warnPendingCount,
      warnQueuedAgeSeconds,
      warnRunningAgeSeconds,
      warnFailedAgeSeconds,
    };
  }
}
