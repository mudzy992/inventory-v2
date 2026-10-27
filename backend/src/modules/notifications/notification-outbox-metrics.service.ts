import { logStructuredEvent, safeErrorText } from '../../common/logging/structured-event.logger';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  evaluateNotificationOutboxMetrics,
  NOTIFICATION_OUTBOX_METRICS_INTERVAL_MS,
  NOTIFICATION_OUTBOX_WARN_AGE_SECONDS,
  NOTIFICATION_OUTBOX_WARN_BACKLOG_COUNT,
  type NotificationOutboxMetrics,
} from './utils/notification-outbox-metrics.util';

const BACKLOG_THRESHOLD_SETTING = 'notifications.outbox.warn_backlog_count';
const AGE_THRESHOLD_SETTING = 'notifications.outbox.warn_age_seconds';

/**
 * Log-based operational signal for the durable notification outbox. Counts
 * and ages are safe to log (no user IDs, titles or messages); the stable event
 * name can be turned into a metric/alert by the log collector.
 */
@Injectable()
export class NotificationOutboxMetricsService {
  private readonly logger = new Logger(NotificationOutboxMetricsService.name);
  private active = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService: SettingsService,
  ) {}

  @Interval(NOTIFICATION_OUTBOX_METRICS_INTERVAL_MS)
  async reportMetrics(): Promise<void> {
    if (this.active) return;
    this.active = true;
    try {
      const snapshot = await this.collectMetrics();
      const evaluation = evaluateNotificationOutboxMetrics(snapshot);
      const line = JSON.stringify({
        event: 'notification_outbox_backlog',
        ...snapshot,
        reasons: evaluation.reasons,
      });
      if (evaluation.level === 'warn') {
        this.logger.warn(line);
      } else {
        this.logger.log(line);
      }
    } catch (error) {
      logStructuredEvent(this.logger, 'error', {
        event: 'notification_outbox_collection_failed',
        error: safeErrorText(error),
      });
    } finally {
      this.active = false;
    }
  }

  async collectMetrics(now = new Date()): Promise<NotificationOutboxMetrics> {
    const [backlogWarnThreshold, ageWarnThresholdSeconds, pending, running, oldest] =
      await Promise.all([
        this.readNumberSetting(BACKLOG_THRESHOLD_SETTING, NOTIFICATION_OUTBOX_WARN_BACKLOG_COUNT),
        this.readNumberSetting(AGE_THRESHOLD_SETTING, NOTIFICATION_OUTBOX_WARN_AGE_SECONDS),
        this.prisma.notificationOutbox.count({ where: { status: 'pending' } }),
        this.prisma.notificationOutbox.count({ where: { status: 'running' } }),
        this.prisma.notificationOutbox.findFirst({
          where: { status: { in: ['pending', 'running'] } },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true, status: true, attempts: true },
        }),
      ]);

    const oldestStatus =
      oldest?.status === 'pending' || oldest?.status === 'running' ? oldest.status : null;
    return {
      pending,
      running,
      backlog: pending + running,
      oldestUndeliveredAgeSeconds: oldest
        ? Math.max(0, Math.floor((now.getTime() - oldest.createdAt.getTime()) / 1_000))
        : 0,
      oldestStatus,
      oldestAttempts: oldest?.attempts ?? null,
      backlogWarnThreshold,
      ageWarnThresholdSeconds,
    };
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
