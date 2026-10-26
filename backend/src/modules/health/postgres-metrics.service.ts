import { Inject, forwardRef, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { redactSensitiveText } from '../../common/utils/redact-log.util';
import { PrismaService } from '../../prisma/prisma.service';
import { postgresPoolRegistry } from '../../prisma/postgres-pool.registry';
import { SettingsService } from '../settings/settings.service';
import {
  buildPostgresMetricsSnapshot,
  evaluatePostgresMetrics,
  POSTGRES_METRICS_INTERVAL_MS,
  POSTGRES_WARN_LATENCY_MS,
  POSTGRES_WARN_UTILIZATION_PERCENT,
  POSTGRES_WARN_WAITING_COUNT,
  type PostgresMetricsSnapshot,
  type PostgresMetricsThresholds,
} from './utils/postgres-metrics.util';

const LATENCY_THRESHOLD_SETTING = 'database.metrics.warn_latency_ms';
const WAITING_THRESHOLD_SETTING = 'database.metrics.warn_waiting_count';
const UTILIZATION_THRESHOLD_SETTING = 'database.metrics.warn_utilization_percent';

/**
 * Log-based PostgreSQL saturation and probe-latency signal. Reads live pg.Pool
 * counters owned by PrismaService and performs a harmless `SELECT 1` probe;
 * no application data or connection string is logged.
 */
@Injectable()
export class PostgresMetricsService {
  private readonly logger = new Logger(PostgresMetricsService.name);
  private active = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService: SettingsService,
  ) {}

  @Interval(POSTGRES_METRICS_INTERVAL_MS)
  async reportMetrics(): Promise<PostgresMetricsSnapshot | null> {
    if (this.active) return null;
    this.active = true;
    try {
      const snapshot = await this.collectMetrics();
      const evaluation = evaluatePostgresMetrics(snapshot);
      const line = JSON.stringify({
        event: 'postgres_pool_latency',
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
          event: 'postgres_pool_latency_error',
          error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
        }),
      );
      return null;
    } finally {
      this.active = false;
    }
  }

  async collectMetrics(): Promise<PostgresMetricsSnapshot> {
    const thresholds = await this.readThresholds();
    const poolStats = postgresPoolRegistry.getStats();
    const startedAt = Date.now();
    let latencyMs: number | null = null;
    let dbState: 'connected' | 'error' = 'connected';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      latencyMs = Math.max(0, Date.now() - startedAt);
    } catch {
      dbState = 'error';
    }
    return buildPostgresMetricsSnapshot(poolStats, latencyMs, dbState, thresholds);
  }

  private async readThresholds(): Promise<PostgresMetricsThresholds> {
    const readNumber = async (key: string, fallback: number): Promise<number> => {
      try {
        const value = await this.settingsService.getNumberValue(key, fallback);
        return typeof value === 'number' && Number.isFinite(value) && value > 0
          ? value
          : fallback;
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            event: 'postgres_metrics_setting_fallback',
            key,
            error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
          }),
        );
        return fallback;
      }
    };
    const [warnLatencyMs, warnWaitingCount, warnUtilizationPercent] = await Promise.all([
      readNumber(LATENCY_THRESHOLD_SETTING, POSTGRES_WARN_LATENCY_MS),
      readNumber(WAITING_THRESHOLD_SETTING, POSTGRES_WARN_WAITING_COUNT),
      readNumber(UTILIZATION_THRESHOLD_SETTING, POSTGRES_WARN_UTILIZATION_PERCENT),
    ]);
    return { warnLatencyMs, warnWaitingCount, warnUtilizationPercent };
  }
}
