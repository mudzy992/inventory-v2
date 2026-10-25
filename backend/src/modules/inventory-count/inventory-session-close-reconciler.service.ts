import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import {
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
            { sessionId: job.sessionId },
            { jobId: buildInventoryCloseRecoveryJobId(job.id, job.updatedAt) },
          );
        } catch (error) {
          this.logger.error(
            `Failed to enqueue inventory close job for session ${job.sessionId}: ${String(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Failed to reconcile queued inventory close jobs: ${String(error)}`);
    } finally {
      this.reconciliationRunning = false;
    }
  }
}
