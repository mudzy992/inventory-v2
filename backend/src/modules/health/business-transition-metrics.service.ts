import { Inject, forwardRef, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { redactSensitiveText } from '../../common/utils/redact-log.util';
import { businessTransitionMetricsRegistry } from '../../common/metrics/business-transition-metrics.registry';
import type { BusinessTransitionMetricsSnapshot } from '../../common/metrics/business-transition-metrics.registry';
import { SettingsService } from '../settings/settings.service';
import {
  DEFAULT_BUSINESS_TRANSITION_METRICS_THRESHOLDS,
  evaluateBusinessTransitionMetrics,
  BUSINESS_TRANSITION_METRICS_INTERVAL_MS,
  type BusinessTransitionMetricsThresholds,
} from './utils/business-transition-metrics.util';

const REJECTED_COUNT_SETTING = 'business.metrics.warn_rejected_count';
const REJECTED_RATE_SETTING = 'business.metrics.warn_rejected_rate_percent';
const FAILED_TERMINAL_SETTING = 'business.metrics.warn_failed_terminal_count';
const MIN_TRANSITIONS_SETTING = 'business.metrics.min_transition_count';

/**
 * Aggregated signal for conditional business state transitions. Every
 * compare-and-set write records `applied` or `rejected`; this service emits a
 * low-noise 30-second summary so stale/duplicate attempts, retry storms and
 * terminal failures are visible without entity IDs or business payloads.
 */
@Injectable()
export class BusinessTransitionMetricsService {
  private readonly logger = new Logger(BusinessTransitionMetricsService.name);
  private active = false;

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService: SettingsService,
  ) {}

  @Interval(BUSINESS_TRANSITION_METRICS_INTERVAL_MS)
  async reportMetrics(now: Date = new Date()): Promise<BusinessTransitionMetricsSnapshot | null> {
    if (this.active) return null;
    this.active = true;
    try {
      const thresholds = await this.readThresholds();
      const snapshot = businessTransitionMetricsRegistry.consumeSnapshot(now);
      const evaluation = evaluateBusinessTransitionMetrics(snapshot, thresholds);
      const line = JSON.stringify({
        event: 'business_state_transition_metrics',
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
          event: 'business_state_transition_metrics_error',
          error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
        }),
      );
      return null;
    } finally {
      this.active = false;
    }
  }

  private async readThresholds(): Promise<BusinessTransitionMetricsThresholds> {
    const readNumber = async (key: string, fallback: number, max: number): Promise<number> => {
      try {
        const value = await this.settingsService.getNumberValue(key, fallback);
        return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max
          ? value
          : fallback;
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            event: 'business_transition_metrics_setting_fallback',
            key,
            error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
          }),
        );
        return fallback;
      }
    };
    const defaults = DEFAULT_BUSINESS_TRANSITION_METRICS_THRESHOLDS;
    const [warnRejectedCount, warnRejectedRatePercent, warnFailedTerminalCount, minTransitionCount] =
      await Promise.all([
        readNumber(REJECTED_COUNT_SETTING, defaults.warnRejectedCount, 10_000),
        readNumber(REJECTED_RATE_SETTING, defaults.warnRejectedRatePercent, 100),
        readNumber(FAILED_TERMINAL_SETTING, defaults.warnFailedTerminalCount, 10_000),
        readNumber(MIN_TRANSITIONS_SETTING, defaults.minTransitionCount, 10_000),
      ]);
    return {
      warnRejectedCount,
      warnRejectedRatePercent,
      warnFailedTerminalCount,
      minTransitionCount,
    };
  }
}
