import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InventoryCountService } from './inventory-count.service';

const WORKER_TICK_MS = 1200;
const ACTION_THROTTLE_MS = 250;

@Injectable()
export class InventorySessionCloseWorkerService {
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryCountService: InventoryCountService,
    private readonly notificationsService: NotificationsService,
  ) {
    setInterval(() => void this.tick(), WORKER_TICK_MS);
  }

  private async tick(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    try {
      await this.processOneJob();
    } finally {
      this.isRunning = false;
    }
  }

  private async processOneJob(): Promise<void> {
    const job = await this.prisma.inventorySessionCloseJob.findFirst({
      where: { status: 'queued' },
      orderBy: { createdAt: 'asc' },
    });
    if (!job) {
      return;
    }
    const claimed = await this.prisma.inventorySessionCloseJob.updateMany({
      where: { id: job.id, status: 'queued' },
      data: { status: 'running', startedAt: new Date(), lastError: null },
    });
    if (claimed.count !== 1) {
      return;
    }
    try {
      await this.applyPendingActions(job.sessionId);
      await this.prisma.inventorySession.update({
        where: { id: job.sessionId },
        data: { status: 'closed', closedAt: new Date() },
      });
      const doneJob = await this.prisma.inventorySessionCloseJob.update({
        where: { id: job.id },
        data: { status: 'done', endedAt: new Date() },
      });
      await this.emitCloseJobUpdate(job.sessionId, doneJob);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failedJob = await this.prisma.inventorySessionCloseJob.update({
        where: { id: job.id },
        data: { status: 'failed', endedAt: new Date(), lastError: message },
      });
      await this.emitCloseJobUpdate(job.sessionId, failedJob);
      throw err;
    }
  }

  private async emitCloseJobUpdate(
    sessionId: string,
    job: {
      status: string;
      appliedCount: number;
      failedCount: number;
      totalCount: number;
    },
  ): Promise<void> {
    await this.notificationsService.emitInventoryCloseJobProgress(sessionId, {
      status: job.status,
      appliedCount: job.appliedCount,
      failedCount: job.failedCount,
      totalCount: job.totalCount,
    });
  }

  private async applyPendingActions(sessionId: string): Promise<void> {
    while (true) {
      const action = await this.prisma.inventoryPendingAction.findFirst({
        where: { sessionId, status: 'pending' },
        orderBy: { createdAt: 'asc' },
      });
      if (!action) {
        break;
      }
      const claimed = await this.prisma.inventoryPendingAction.updateMany({
        where: { id: action.id, status: 'pending' },
        data: { status: 'running', attempts: { increment: 1 }, lastError: null },
      });
      if (claimed.count !== 1) {
        continue;
      }
      try {
        await this.inventoryCountService.applyPendingAction(action.id);
        await this.prisma.inventoryPendingAction.update({
          where: { id: action.id },
          data: { status: 'applied', appliedAt: new Date() },
        });
        const progressJob = await this.prisma.inventorySessionCloseJob.update({
          where: { sessionId },
          data: { appliedCount: { increment: 1 } },
        });
        await this.emitCloseJobUpdate(sessionId, progressJob);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.prisma.inventoryPendingAction.update({
          where: { id: action.id },
          data: { status: 'failed', lastError: message },
        });
        const failedProgressJob = await this.prisma.inventorySessionCloseJob.update({
          where: { sessionId },
          data: { failedCount: { increment: 1 } },
        });
        await this.emitCloseJobUpdate(sessionId, failedProgressJob);
      }
      await new Promise((resolve) => setTimeout(resolve, ACTION_THROTTLE_MS));
    }
  }
}

