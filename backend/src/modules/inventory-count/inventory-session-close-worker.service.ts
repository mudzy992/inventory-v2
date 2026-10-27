import { logStructuredEvent, safeErrorText } from '../../common/logging/structured-event.logger';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { runWithCorrelationId } from '../../common/utils/correlation-id.util';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InventoryCountService } from './inventory-count.service';
import {
  INVENTORY_SESSION_CLOSE_QUEUE,
  type InventorySessionCloseJobPayload,
} from './inventory-session-close.queue';
import { isFinalInventoryCloseAttempt } from './utils/inventory-close-retry.util';
import {
  getPendingActionRetryDelayMs,
  isRetryablePendingActionError,
} from './utils/classify-pending-action-error.util';
import {
  buildInventoryCloseJobClaimWhere,
  getInventoryCloseLeaseUntil,
  INVENTORY_CLOSE_HEARTBEAT_MS,
} from './utils/inventory-close-lease.util';

const ACTION_THROTTLE_MS = 250;
const MAX_PENDING_ACTION_ATTEMPTS = 3;

class InventoryCloseLeaseLostError extends Error {
  constructor() {
    super('Inventory close worker lease was lost');
    this.name = 'InventoryCloseLeaseLostError';
  }
}

/**
 * BullMQ worker za zatvaranje inventurne sesije — zamjenjuje raniju
 * implementaciju koja je svakih 1200ms pollovala Postgres upitom
 * "ima li queued posla" bez obzira da li ga stvarno ima (konstantno
 * opterećenje baze i dalje kad platforma miruje). BullMQ Worker se
 * budi ISKLJUČIVO kad Redis javi da je stigao novi posao (Redis
 * blocking mehanizam iznutra) — nula idle DB opterećenja.
 *
 * Dodatna dobit u odnosu na raniju implementaciju:
 *  - DB lease token + expiry dozvoljavaju preuzimanje posla koji je ostao
 *    'running' nakon pada procesa; heartbeat sprečava normalno aktivan
 *    worker da izgubi vlasništvo, a reconciler ponovo enqueue-a istekle lease-ove;
 *  - stale pending-action statusi se atomarno vraćaju u 'pending' pri takeover-u;
 *  - terminalne/failed akcije ostaju evidentirane, a idempotentni side effecti
 *    čine replay nakon prekida sigurnim.
 *
 * BullMQ i dalje upravlja retry/backoff-om samog close joba, dok lease expiry
 *    pruža DB-side recovery kada worker proces ne može izvršiti svoj catch block.
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
    const correlationId = job.data.correlationId ?? randomUUID();
    await runWithCorrelationId(correlationId, () => this.processWithCorrelation(job));
  }

  private async processWithCorrelation(job: Job<InventorySessionCloseJobPayload>): Promise<void> {
    const { sessionId } = job.data;
    const dbJob = await this.prisma.inventorySessionCloseJob.findUnique({ where: { sessionId } });
    if (!dbJob) {
      logStructuredEvent(this.logger, 'warn', {
        event: 'inventory_close_job_row_missing',
        sessionId,
      });
      return;
    }

    const leaseToken = randomUUID();
    const claimedAt = new Date();
    const claimed = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.inventorySessionCloseJob.updateMany({
        where: buildInventoryCloseJobClaimWhere(dbJob.id, claimedAt),
        data: {
          status: 'running',
          leaseToken,
          leaseUntil: getInventoryCloseLeaseUntil(claimedAt),
          startedAt: claimedAt,
          endedAt: null,
          lastError: null,
        },
      });
      if (claim.count !== 1) {
        return false;
      }
      // Any running action belongs to the expired/abandoned close-job lease.
      // Requeue it atomically with takeover; side effects are idempotent.
      await tx.inventoryPendingAction.updateMany({
        where: { sessionId, status: 'running' },
        data: { status: 'pending', leaseToken: null },
      });
      return true;
    });
    if (!claimed) {
      logStructuredEvent(this.logger, 'debug', {
        event: 'inventory_close_job_skipped',
        sessionId,
        reason: 'claimed_or_terminal',
      });
      return;
    }

    let leaseLost = false;
    let heartbeatInFlight = false;
    const renewLease = async (): Promise<boolean> => {
      if (leaseLost) {
        return false;
      }
      const result = await this.prisma.inventorySessionCloseJob.updateMany({
        where: { id: dbJob.id, status: 'running', leaseToken },
        data: { leaseUntil: getInventoryCloseLeaseUntil() },
      });
      if (result.count !== 1) {
        leaseLost = true;
        return false;
      }
      return true;
    };
    const assertLease = async (): Promise<void> => {
      if (!(await renewLease())) {
        throw new InventoryCloseLeaseLostError();
      }
    };
    const heartbeat = setInterval(() => {
      if (heartbeatInFlight || leaseLost) {
        return;
      }
      heartbeatInFlight = true;
      void renewLease()
        .catch((error: unknown) => {
          leaseLost = true;
          logStructuredEvent(this.logger, 'error', {
            event: 'inventory_close_lease_renewal_failed',
            sessionId,
            error: safeErrorText(error),
          });
        })
        .finally(() => {
          heartbeatInFlight = false;
        });
    }, INVENTORY_CLOSE_HEARTBEAT_MS);
    heartbeat.unref?.();

    try {
      await this.applyPendingActions(sessionId, leaseToken, assertLease);
      await assertLease();
      const closeNotificationOutboxRows =
        await this.notificationsService.buildInventorySessionClosedOutboxRows(sessionId);
      const doneJob = await this.prisma.$transaction(async (tx) => {
        const finalized = await tx.inventorySessionCloseJob.updateMany({
          where: { id: dbJob.id, status: 'running', leaseToken },
          data: {
            status: 'done',
            endedAt: new Date(),
            leaseToken: null,
            leaseUntil: null,
          },
        });
        if (finalized.count !== 1) {
          throw new InventoryCloseLeaseLostError();
        }
        await tx.inventorySession.update({
          where: { id: sessionId },
          data: { status: 'closed', closedAt: new Date() },
        });
        if (closeNotificationOutboxRows.length > 0) {
          await tx.notificationOutbox.createMany({
            data: closeNotificationOutboxRows,
            skipDuplicates: true,
          });
        }
        return tx.inventorySessionCloseJob.findUniqueOrThrow({ where: { id: dbJob.id } });
      });
      await this.emitCloseJobUpdate(sessionId, doneJob);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const finalAttempt = isFinalInventoryCloseAttempt(job.attemptsMade, job.opts.attempts);
      const released = await this.prisma.inventorySessionCloseJob.updateMany({
        where: { id: dbJob.id, status: 'running', leaseToken },
        data: {
          status: finalAttempt ? 'failed' : 'queued',
          endedAt: finalAttempt ? new Date() : null,
          lastError: message,
          leaseToken: null,
          leaseUntil: null,
        },
      });
      if (released.count === 1) {
        const failedJob = await this.prisma.inventorySessionCloseJob.findUniqueOrThrow({
          where: { id: dbJob.id },
        });
        await this.emitCloseJobUpdate(sessionId, failedJob);
      }
      throw err; // BullMQ retry/backoff preuzima odavde; expired lease pokriva crash recovery.
    } finally {
      clearInterval(heartbeat);
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

  private async applyPendingActions(
    sessionId: string,
    leaseToken: string,
    assertLease: () => Promise<void>,
  ): Promise<void> {
    while (true) {
      await assertLease();
      const action = await this.prisma.inventoryPendingAction.findFirst({
        where: { sessionId, status: 'pending' },
        orderBy: { createdAt: 'asc' },
      });
      if (!action) {
        break;
      }
      const claimed = await this.prisma.$transaction(async (tx) => {
        const owner = await tx.inventorySessionCloseJob.findFirst({
          where: { sessionId, status: 'running', leaseToken },
          select: { id: true },
        });
        if (!owner) {
          return false;
        }
        const result = await tx.inventoryPendingAction.updateMany({
          where: { id: action.id, sessionId, status: 'pending' },
          data: {
            status: 'running',
            leaseToken,
            attempts: { increment: 1 },
            lastError: null,
          },
        });
        return result.count === 1;
      });
      if (!claimed) {
        continue;
      }
      await assertLease();

      let applied = false;
      let actionError: unknown;
      let retryCount = 0;
      while (true) {
        try {
          await this.inventoryCountService.applyPendingAction(action.id);
          applied = true;
          break;
        } catch (err) {
          actionError = err;
          if (
            !isRetryablePendingActionError(err) ||
            retryCount + 1 >= MAX_PENDING_ACTION_ATTEMPTS
          ) {
            break;
          }

          retryCount += 1;
          const delayMs = getPendingActionRetryDelayMs(retryCount);
          logStructuredEvent(this.logger, 'warn', {
            event: 'inventory_pending_action_retry_scheduled',
            actionId: action.id,
            attempt: retryCount + 1,
            maxAttempts: MAX_PENDING_ACTION_ATTEMPTS,
            delayMs,
          });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      const progressJob = await this.finalizePendingAction({
        actionId: action.id,
        sessionId,
        leaseToken,
        status: applied ? 'applied' : 'failed',
        lastError: applied
          ? null
          : actionError instanceof Error
            ? actionError.message
            : String(actionError),
        retryCount,
      });
      await this.emitCloseJobUpdate(sessionId, progressJob);
      await new Promise((resolve) => setTimeout(resolve, ACTION_THROTTLE_MS));
    }
  }

  private async finalizePendingAction(input: {
    actionId: string;
    sessionId: string;
    leaseToken: string;
    status: 'applied' | 'failed';
    lastError: string | null;
    retryCount: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const retryAttemptCount =
        input.retryCount > 0 ? { attempts: { increment: input.retryCount } } : {};
      const actionUpdate = await tx.inventoryPendingAction.updateMany({
        where: {
          id: input.actionId,
          status: 'running',
          leaseToken: input.leaseToken,
        },
        data: {
          status: input.status,
          appliedAt: input.status === 'applied' ? new Date() : null,
          lastError: input.lastError,
          leaseToken: null,
          ...retryAttemptCount,
        },
      });
      if (actionUpdate.count !== 1) {
        throw new InventoryCloseLeaseLostError();
      }

      const progressUpdate = await tx.inventorySessionCloseJob.updateMany({
        where: {
          sessionId: input.sessionId,
          status: 'running',
          leaseToken: input.leaseToken,
        },
        data: {
          ...(input.status === 'applied'
            ? { appliedCount: { increment: 1 } }
            : { failedCount: { increment: 1 } }),
          leaseUntil: getInventoryCloseLeaseUntil(),
        },
      });
      if (progressUpdate.count !== 1) {
        throw new InventoryCloseLeaseLostError();
      }
      return tx.inventorySessionCloseJob.findUniqueOrThrow({
        where: { sessionId: input.sessionId },
      });
    });
  }
}
