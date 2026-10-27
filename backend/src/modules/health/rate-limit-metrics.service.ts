import { Inject, forwardRef, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { redactSensitiveText } from '../../common/utils/redact-log.util';
import { rateLimitMetricsRegistry } from '../../redis/rate-limit-metrics.registry';
import type { RateLimitMetricsSnapshot } from '../../redis/rate-limit-metrics.registry';
import { SettingsService } from '../settings/settings.service';
import {
  DEFAULT_RATE_LIMIT_METRICS_THRESHOLDS,
  evaluateRateLimitMetrics,
  RATE_LIMIT_METRICS_INTERVAL_MS,
  type RateLimitMetricsThresholds,
} from './utils/rate-limit-metrics.util';

const FAIL_OPEN_SETTING = 'rate_limit.metrics.warn_fail_open_count';
const CONSECUTIVE_SETTING = 'rate_limit.metrics.warn_consecutive_failures';
const EXCEEDED_SETTING = 'rate_limit.metrics.warn_exceeded_count';

/**
 * Aggregated rate-limit decision/outage signal. The guard records every
 * decision (allowed/exceeded/fail_open/fail_closed) into a bounded registry;
 * this service adds a low-noise 30-second summary so a Redis outage, a
 * fail-closed rejection or a 429 burst is visible without client IPs.
 */
@Injectable()
export class RateLimitMetricsService {
  private readonly logger = new Logger(RateLimitMetricsService.name);
  private active = false;

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService: SettingsService,
  ) {}

  @Interval(RATE_LIMIT_METRICS_INTERVAL_MS)
  async reportMetrics(now: Date = new Date()): Promise<RateLimitMetricsSnapshot | null> {
    if (this.active) return null;
    this.active = true;
    try {
      const thresholds = await this.readThresholds();
      const snapshot = rateLimitMetricsRegistry.consumeSnapshot(now);
      const evaluation = evaluateRateLimitMetrics(snapshot, thresholds);
      const line = JSON.stringify({
        event: 'rate_limit_metrics',
        ...snapshot,
        ...thresholds,
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
          event: 'rate_limit_metrics_error',
          error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
        }),
      );
      return null;
    } finally {
      this.active = false;
    }
  }

  private async readThresholds(): Promise<RateLimitMetricsThresholds> {
    const readNumber = async (key: string, fallback: number): Promise<number> => {
      try {
        const value = await this.settingsService.getNumberValue(key, fallback);
        return typeof value === 'number' && Number.isFinite(value) && value > 0
          ? value
          : fallback;
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            event: 'rate_limit_metrics_setting_fallback',
            key,
            error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
          }),
        );
        return fallback;
      }
    };
    const defaults = DEFAULT_RATE_LIMIT_METRICS_THRESHOLDS;
    const [warnFailOpenCount, warnConsecutiveFailures, warnExceededCount] = await Promise.all([
      readNumber(FAIL_OPEN_SETTING, defaults.warnFailOpenCount),
      readNumber(CONSECUTIVE_SETTING, defaults.warnConsecutiveFailures),
      readNumber(EXCEEDED_SETTING, defaults.warnExceededCount),
    ]);
    return { warnFailOpenCount, warnConsecutiveFailures, warnExceededCount };
  }
}
