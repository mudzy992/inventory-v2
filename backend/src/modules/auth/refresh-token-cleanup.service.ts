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
        this.logger.log(`Removed ${result.deleted} expired refresh-token records.`);
      }
      if (result.hasMore) {
        this.logger.warn(
          `Expired refresh-token cleanup reached its ${CLEANUP_MAX_BATCHES}-batch limit; remaining records will be handled by the next run.`,
        );
      }
    } catch (error) {
      this.logger.error(`Expired refresh-token cleanup failed: ${String(error)}`);
    } finally {
      this.cleanupRunning = false;
    }
  }
}
