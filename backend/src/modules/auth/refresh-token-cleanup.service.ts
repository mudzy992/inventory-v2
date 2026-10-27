import { logStructuredEvent, safeErrorText } from '../../common/logging/structured-event.logger';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { cleanupExpiredRefreshTokens } from './utils/cleanup-expired-refresh-tokens.util';

const CLEANUP_BATCH_SIZE = 1000;
const CLEANUP_MAX_BATCHES = 20;

@Injectable()
export class RefreshTokenCleanupService {
  private readonly logger = new Logger(RefreshTokenCleanupService.name);
  private cleanupRunning = false;

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 3 * * *', { timeZone: 'UTC' })
  async cleanupExpiredTokens(): Promise<void> {
    if (this.cleanupRunning) return;
    this.cleanupRunning = true;
    try {
      const result = await cleanupExpiredRefreshTokens(this.prisma, new Date(), {
        batchSize: CLEANUP_BATCH_SIZE,
        maxBatches: CLEANUP_MAX_BATCHES,
      });
      if (result.deleted > 0) {
        logStructuredEvent(this.logger, 'log', {
          event: 'refresh_token_cleanup_completed',
          deletedCount: result.deleted,
        });
      }
      if (result.hasMore) {
        logStructuredEvent(this.logger, 'warn', {
          event: 'refresh_token_cleanup_batch_limit',
          maxBatches: CLEANUP_MAX_BATCHES,
        });
      }
    } catch (error) {
      logStructuredEvent(this.logger, 'error', {
        event: 'refresh_token_cleanup_failed',
        error: safeErrorText(error),
      });
    } finally {
      this.cleanupRunning = false;
    }
  }
}
