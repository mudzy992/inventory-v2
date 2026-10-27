import { logStructuredEvent, safeErrorText } from '../../common/logging/structured-event.logger';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildInventoryCloseJobPayload,
  INVENTORY_SESSION_CLOSE_JOB_NAME,
  INVENTORY_SESSION_CLOSE_QUEUE,
} from './inventory-session-close.queue';
import { buildInventoryCloseRecoveryJobId } from './utils/inventory-close-recovery.util';

const RECONCILE_INTERVAL_MS = 60_000;
const RECONCILE_BATCH_SIZE = 100;

@Injectable()
export class InventorySessionCloseReconcilerService implements OnModuleInit {
  private readonly logger = new Logger(InventorySessionCloseReconcilerService.name);
  private reconciliationRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(INVENTORY_SESSION_CLOSE_QUEUE)
    private readonly closeSessionQueue: Queue,
  ) {}

  onModuleInit(): void {
    void this.reconcileQueuedJobs();
  }

  @Interval(RECONCILE_INTERVAL_MS)
  async reconcileQueuedJobs(): Promise<void> {
    if (this.reconciliationRunning) {
      return;
    }
    this.reconciliationRunning = true;
    try {
      const now = new Date();
      const jobs = await this.prisma.inventorySessionCloseJob.findMany({
        where: {
          OR: [
            { status: 'queued' },
            {
              status: 'running',
              OR: [{ leaseUntil: { lte: now } }, { leaseUntil: null }],
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: RECONCILE_BATCH_SIZE,
        select: { id: true, sessionId: true, updatedAt: true },
      });
      for (const job of jobs) {
        try {
          await this.closeSessionQueue.add(
            INVENTORY_SESSION_CLOSE_JOB_NAME,
            buildInventoryCloseJobPayload(job.sessionId),
            { jobId: buildInventoryCloseRecoveryJobId(job.id, job.updatedAt) },
          );
        } catch (error) {
          logStructuredEvent(this.logger, 'error', {
            event: 'inventory_close_reconcile_enqueue_failed',
            sessionId: job.sessionId,
            error: safeErrorText(error),
          });
        }
      }
    } catch (error) {
      logStructuredEvent(this.logger, 'error', {
        event: 'inventory_close_reconcile_failed',
        error: safeErrorText(error),
      });
    } finally {
      this.reconciliationRunning = false;
    }
  }
}
