import { Inject, forwardRef, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { redactSensitiveText } from '../../common/utils/redact-log.util';
import { redisConnectionRegistry } from '../../redis/redis-connection.registry';
import { RedisService } from '../../redis/redis.service';
import { SettingsService } from '../settings/settings.service';
import {
  buildRedisMetricsSnapshot,
  evaluateRedisMetrics,
  REDIS_METRICS_INTERVAL_MS,
  REDIS_PING_TIMEOUT_MS,
  REDIS_WARN_DISCONNECT_SECONDS,
  REDIS_WARN_PING_MS,
  REDIS_WARN_RECONNECT_COUNT,
  withTimeout,
  type RedisMetricsSnapshot,
  type RedisMetricsThresholds,
} from './utils/redis-metrics.util';

const PING_THRESHOLD_SETTING = 'redis.metrics.warn_ping_ms';
const DISCONNECT_THRESHOLD_SETTING = 'redis.metrics.warn_disconnect_seconds';
const RECONNECT_THRESHOLD_SETTING = 'redis.metrics.warn_reconnect_count';

/**
 * Log-based Redis readiness/reconnect signal. Combines process-lifetime
 * connection events with a bounded PING probe; no keys, payloads or
 * credentials are logged.
 */
@Injectable()
export class RedisMetricsService {
  private readonly logger = new Logger(RedisMetricsService.name);
  private active = false;

  constructor(
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService: SettingsService,
  ) {}

  @Interval(REDIS_METRICS_INTERVAL_MS)
  async reportMetrics(): Promise<RedisMetricsSnapshot | null> {
    if (this.active) return null;
    this.active = true;
    try {
      const snapshot = await this.collectMetrics();
      const evaluation = evaluateRedisMetrics(snapshot);
      const line = JSON.stringify({
        event: 'redis_connection_health',
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
          event: 'redis_connection_health_error',
          error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
        }),
      );
      return null;
    } finally {
      this.active = false;
    }
  }

  async collectMetrics(): Promise<RedisMetricsSnapshot> {
    const thresholds = await this.readThresholds();
    const stats = redisConnectionRegistry.getStats();
    const startedAt = Date.now();
    let pingOk = false;
    let pingMs: number | null = null;
    try {
      const reply = await withTimeout(
        this.redisService.getClient().ping(),
        REDIS_PING_TIMEOUT_MS,
        'Redis PING',
      );
      pingOk = reply === 'PONG';
      if (pingOk) {
        pingMs = Math.max(0, Date.now() - startedAt);
      }
    } catch {
      // A bounded probe failure leaves pingOk=false and pingMs=null, which
      // evaluateRedisMetrics reports as the `ping_error` reason.
    }
    return buildRedisMetricsSnapshot(stats, pingMs, pingOk, thresholds);
  }

  private async readThresholds(): Promise<RedisMetricsThresholds> {
    const readNumber = async (key: string, fallback: number): Promise<number> => {
      try {
        const value = await this.settingsService.getNumberValue(key, fallback);
        return typeof value === 'number' && Number.isFinite(value) && value > 0
          ? value
          : fallback;
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            event: 'redis_metrics_setting_fallback',
            key,
            error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
          }),
        );
        return fallback;
      }
    };
    const [warnPingMs, warnDisconnectSeconds, warnReconnectCount] = await Promise.all([
      readNumber(PING_THRESHOLD_SETTING, REDIS_WARN_PING_MS),
      readNumber(DISCONNECT_THRESHOLD_SETTING, REDIS_WARN_DISCONNECT_SECONDS),
      readNumber(RECONNECT_THRESHOLD_SETTING, REDIS_WARN_RECONNECT_COUNT),
    ]);
    return { warnPingMs, warnDisconnectSeconds, warnReconnectCount };
  }
}
