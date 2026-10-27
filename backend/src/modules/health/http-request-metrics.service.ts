import { Inject, forwardRef, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { httpRequestMetricsRegistry } from '../../common/http/http-request-metrics.registry';
import type { HttpRequestMetricsSnapshot } from '../../common/http/http-request-metrics.registry';
import { redactSensitiveText } from '../../common/utils/redact-log.util';
import { SettingsService } from '../settings/settings.service';
import {
  DEFAULT_HTTP_REQUEST_METRICS_THRESHOLDS,
  evaluateHttpRequestMetrics,
  HTTP_REQUEST_METRICS_INTERVAL_MS,
  type HttpRequestMetricsThresholds,
} from './utils/http-request-metrics.util';

const ERROR_RATE_SETTING = 'http.metrics.warn_error_rate_percent';
const P95_SETTING = 'http.metrics.warn_p95_ms';
const COUNT_5XX_SETTING = 'http.metrics.warn_5xx_count';
const MIN_REQUESTS_SETTING = 'http.metrics.min_request_count';

/**
 * Aggregated request latency/error-rate signal. Each completed request already
 * emits one `http_request` line; this service adds a low-noise 30-second
 * summary with bounded route labels, a latency histogram and configurable
 * warning thresholds. No query strings, bodies, headers or user IDs are kept.
 */
@Injectable()
export class HttpRequestMetricsService {
  private readonly logger = new Logger(HttpRequestMetricsService.name);
  private active = false;

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService: SettingsService,
  ) {}

  @Interval(HTTP_REQUEST_METRICS_INTERVAL_MS)
  async reportMetrics(): Promise<HttpRequestMetricsSnapshot | null> {
    if (this.active) return null;
    this.active = true;
    try {
      const thresholds = await this.readThresholds();
      const snapshot = httpRequestMetricsRegistry.consumeSnapshot();
      const evaluation = evaluateHttpRequestMetrics(snapshot, thresholds);
      const line = JSON.stringify({
        event: 'http_request_metrics',
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
          event: 'http_request_metrics_error',
          error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
        }),
      );
      return null;
    } finally {
      this.active = false;
    }
  }

  private async readThresholds(): Promise<HttpRequestMetricsThresholds> {
    const readNumber = async (
      key: string,
      fallback: number,
      max: number,
    ): Promise<number> => {
      try {
        const value = await this.settingsService.getNumberValue(key, fallback);
        return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max
          ? value
          : fallback;
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            event: 'http_metrics_setting_fallback',
            key,
            error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
          }),
        );
        return fallback;
      }
    };
    const defaults = DEFAULT_HTTP_REQUEST_METRICS_THRESHOLDS;
    const [warnErrorRatePercent, warnP95Ms, warn5xxCount, minRequestCount] = await Promise.all([
      readNumber(ERROR_RATE_SETTING, defaults.warnErrorRatePercent, 100),
      readNumber(P95_SETTING, defaults.warnP95Ms, 60_000),
      readNumber(COUNT_5XX_SETTING, defaults.warn5xxCount, 10_000),
      readNumber(MIN_REQUESTS_SETTING, defaults.minRequestCount, 10_000),
    ]);
    return { warnErrorRatePercent, warnP95Ms, warn5xxCount, minRequestCount };
  }
}
