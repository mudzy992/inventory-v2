import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InventoryCountService } from './inventory-count.service';
import {
  INVENTORY_SESSION_CLOSE_QUEUE,
  type InventorySessionCloseJobPayload,
} from './inventory-session-close.queue';

const ACTION_THROTTLE_MS = 250;

/**
 * BullMQ worker za zatvaranje inventurne sesije — zamjenjuje raniju
 * implementaciju koja je svakih 1200ms pollovala Postgres upitom
 * "ima li queued posla" bez obzira da li ga stvarno ima (konstantno
 * opterećenje baze i dalje kad platforma miruje). BullMQ Worker se
 * budi ISKLJUČIVO kad Redis javi da je stigao novi posao (Redis
 * blocking mehanizam iznutra) — nula idle DB opterećenja.
 *
 * Dodatna dobit u odnosu na raniju implementaciju:
 *  - automatski retry sa exponential backoff (definisano globalno u
 *    QueuesModule: 3 pokušaja) ako process() baci grešku prije nego što
 *    stigne da upiše 'failed' status u DB red;
 *  - `concurrency: 2` — do dvije sesije se mogu zatvarati paralelno umjesto
 *    striktno sekvencijalno, bez dodatnog koda za to;
 *  - neuspjeli poslovi ostaju vidljivi u BullMQ failed setu (dead-letter
 *    ponašanje "besplatno", uz retenciju definisanu u QueuesModule).
 *
 * Logika same obrade (claimed = updateMany where status='pending', throttle
 * između akcija) je NAMJERNO zadržana identična ranijoj implementaciji —
 * to je zaštita od duple obrade iste akcije ako BullMQ ikad redeliveruje
 * isti posao (npr. worker restart usred obrade), ne nešto specifično za
 * stari polling model.
 */
@Processor(INVENTORY_SESSION_CLOSE_QUEUE, { concurrency: 2 })
export class InventorySessionCloseWorkerService extends WorkerHost {
  private readonly logger = new Logger(InventorySessionCloseWorkerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryCountService: InventoryCountService,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<InventorySessionCloseJobPayload>): Promise<void> {
    const { sessionId } = job.data;
    const dbJob = await this.prisma.inventorySessionCloseJob.findUnique({ where: { sessionId } });
    if (!dbJob) {
      this.logger.warn(`No inventorySessionCloseJob DB row found for session ${sessionId}, skipping.`);
      return;
    }
    // Isti optimistic-claim obrazac kao ranije: samo jedan worker (od
    // potencijalno više concurrency slotova/instanci) smije preuzeti posao
    // koji je u 'queued' stanju.
    const claimed = await this.prisma.inventorySessionCloseJob.updateMany({
      where: { id: dbJob.id, status: 'queued' },
      data: { status: 'running', startedAt: new Date(), lastError: null },
    });
    if (claimed.count !== 1) {
      this.logger.debug(`Session ${sessionId} close job already claimed/processed, skipping.`);
      return;
    }
    try {
      await this.applyPendingActions(sessionId);
      await this.prisma.inventorySession.update({
        where: { id: sessionId },
        data: { status: 'closed', closedAt: new Date() },
      });
      const doneJob = await this.prisma.inventorySessionCloseJob.update({
        where: { id: dbJob.id },
        data: { status: 'done', endedAt: new Date() },
      });
      await this.emitCloseJobUpdate(sessionId, doneJob);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failedJob = await this.prisma.inventorySessionCloseJob.update({
        where: { id: dbJob.id },
        data: { status: 'failed', endedAt: new Date(), lastError: message },
      });
      await this.emitCloseJobUpdate(sessionId, failedJob);
      throw err; // BullMQ retry/backoff preuzima odavde (vidi QueuesModule).
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
