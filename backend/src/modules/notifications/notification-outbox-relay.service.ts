import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import type { NotificationOutbox } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

const RELAY_INTERVAL_MS = 5_000;
const LEASE_DURATION_MS = 60_000;
const BATCH_SIZE = 50;
const MAX_BACKOFF_MS = 60 * 60 * 1_000;

@Injectable()
export class NotificationOutboxRelayService implements OnModuleInit {
  private readonly logger = new Logger(NotificationOutboxRelayService.name);
  private active = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit(): void {
    void this.relayPendingOutbox();
  }

  @Interval(RELAY_INTERVAL_MS)
  async relayPendingOutbox(): Promise<void> {
    if (this.active) {
      return;
    }
    this.active = true;
    try {
      const now = new Date();
      const pending = await this.prisma.notificationOutbox.findMany({
        where: {
          OR: [
            {
              status: 'pending',
              OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
            },
            { status: 'running', OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      });
      for (const row of pending) {
        await this.deliverOne(row);
      }
    } catch (error) {
      this.logger.error(`Notification outbox scan failed: ${String(error)}`);
    } finally {
      this.active = false;
    }
  }

  private async deliverOne(candidate: NotificationOutbox): Promise<void> {
    const now = new Date();
    const leaseToken = randomUUID();
    const claimed = await this.prisma.notificationOutbox.updateMany({
      where: {
        id: candidate.id,
        OR: [
          {
            status: 'pending',
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
          { status: 'running', OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
        ],
      },
      data: {
        status: 'running',
        leaseToken,
        leaseUntil: new Date(now.getTime() + LEASE_DURATION_MS),
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      return;
    }

    try {
      const outbox = await this.prisma.notificationOutbox.findUnique({
        where: { id: candidate.id },
      });
      if (!outbox || outbox.status !== 'running' || outbox.leaseToken !== leaseToken) {
        return;
      }
      await this.notificationsService.deliverOutboxNotification(outbox);
      await this.prisma.notificationOutbox.updateMany({
        where: { id: outbox.id, status: 'running', leaseToken },
        data: {
          status: 'delivered',
          deliveredAt: new Date(),
          nextAttemptAt: null,
          leaseToken: null,
          leaseUntil: null,
          lastError: null,
        },
      });
    } catch (error) {
      const latest = await this.prisma.notificationOutbox.findUnique({
        where: { id: candidate.id },
        select: { attempts: true },
      });
      const failedAttempt = latest?.attempts ?? 1;
      const retryDelayMs = Math.min(
        RELAY_INTERVAL_MS * 2 ** Math.min(failedAttempt - 1, 10),
        MAX_BACKOFF_MS,
      );
      await this.prisma.notificationOutbox.updateMany({
        where: { id: candidate.id, status: 'running', leaseToken },
        data: {
          status: 'pending',
          nextAttemptAt: new Date(Date.now() + retryDelayMs),
          leaseToken: null,
          leaseUntil: null,
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
      this.logger.error(`Notification outbox delivery failed for ${candidate.id}: ${String(error)}`);
    }
  }
}
