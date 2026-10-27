import { Inject, forwardRef, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { uploadRejectRegistry } from '../../common/upload/upload-reject.registry';
import type { UploadRejectSnapshot } from '../../common/upload/upload-reject.registry';
import { redactSensitiveText } from '../../common/utils/redact-log.util';
import { SettingsService } from '../settings/settings.service';
import {
  evaluateUploadRejectMetrics,
  UPLOAD_REJECT_METRICS_INTERVAL_MS,
  UPLOAD_WARN_REJECT_COUNT,
} from './utils/upload-reject-metrics.util';

const WARN_REJECT_COUNT_SETTING = 'upload.metrics.warn_reject_count';

/**
 * Aggregated upload-rejection signal. Individual rejections emit an
 * `upload_rejected` line; this service adds a low-noise periodic summary so a
 * sudden burst of invalid uploads is visible without storing filenames or PII.
 */
@Injectable()
export class UploadRejectMetricsService {
  private readonly logger = new Logger(UploadRejectMetricsService.name);
  private active = false;

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService: SettingsService,
  ) {}

  @Interval(UPLOAD_REJECT_METRICS_INTERVAL_MS)
  async reportMetrics(): Promise<UploadRejectSnapshot | null> {
    if (this.active) return null;
    this.active = true;
    try {
      const warnRejectCount = await this.readWarnRejectCount();
      const snapshot = uploadRejectRegistry.consumeSnapshot();
      const evaluation = evaluateUploadRejectMetrics(snapshot, warnRejectCount);
      const line = JSON.stringify({
        event: 'upload_reject_metrics',
        ...snapshot,
        warnRejectCount,
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
          event: 'upload_reject_metrics_error',
          error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
        }),
      );
      return null;
    } finally {
      this.active = false;
    }
  }

  private async readWarnRejectCount(): Promise<number> {
    try {
      const value = await this.settingsService.getNumberValue(
        WARN_REJECT_COUNT_SETTING,
        UPLOAD_WARN_REJECT_COUNT,
      );
      return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : UPLOAD_WARN_REJECT_COUNT;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'upload_metrics_setting_fallback',
          key: WARN_REJECT_COUNT_SETTING,
          error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
        }),
      );
      return UPLOAD_WARN_REJECT_COUNT;
    }
  }
}
