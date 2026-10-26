import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { NotificationOutboxRelayService } from '../src/modules/notifications/notification-outbox-relay.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';

const assertTestDatabase = (): void => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ''));
  if (
    process.env.NODE_ENV !== 'test' ||
    !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
    databaseName !== 'inventory_ci'
  ) {
    throw new Error('Notification outbox crash check is restricted to the local inventory_ci test database');
  }
};

const crashAfterPublish = async (outboxId: string, publishMarkerPath: string): Promise<never> => {
  assertTestDatabase();
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    const notifications = new NotificationsService(
      prisma,
      {} as never,
      {} as never,
      {
        emitNotificationCreated: (_userId: string, notification: unknown) => {
          writeFileSync(publishMarkerPath, JSON.stringify(notification));
          process.kill(process.pid, 'SIGKILL');
        },
      } as never,
      {} as never,
    );
    const relay = new NotificationOutboxRelayService(prisma, notifications);
    await relay.relayPendingOutbox();
    throw new Error(`Expected SIGKILL after publishing outbox row ${outboxId}`);
  } finally {
    await prisma.$disconnect();
  }
};

const main = async (): Promise<void> => {
  assertTestDatabase();
  const prisma = new PrismaService();
  const userId = randomUUID();
  const outboxId = randomUUID();
  const idempotencyKey = `ci-outbox-crash:${outboxId}`;
  const tempDirectory = mkdtempSync(join(tmpdir(), 'inventory-outbox-crash-'));
  const publishMarkerPath = join(tempDirectory, 'published.json');
  let connected = false;

  try {
    await prisma.$connect();
    connected = true;
    await prisma.user.create({
      data: {
        id: userId,
        username: `ci-outbox-crash-${userId}`,
        passwordHash: 'test-only',
        role: 'admin',
      },
    });
    await prisma.notificationOutbox.create({
      data: {
        id: outboxId,
        idempotencyKey,
        userId,
        type: 'inventory_session_closed',
        title: 'CI outbox crash test',
        message: 'Durable notification must survive relay process death.',
        relatedId: outboxId,
      },
    });

    const killedRelay = spawnSync(
      process.execPath,
      ['--import', 'tsx', resolve(process.cwd(), 'prisma/check-notification-outbox-crash-replay.ts')],
      {
        env: {
          ...process.env,
          NOTIFICATION_OUTBOX_CRASH_ID: outboxId,
          NOTIFICATION_OUTBOX_PUBLISH_MARKER: publishMarkerPath,
        },
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    assert.equal(killedRelay.signal, 'SIGKILL', 'relay process must die after the publish side effect');
    const firstPublishedNotification = JSON.parse(readFileSync(publishMarkerPath, 'utf8')) as {
      id: string;
      userId: string;
      type: string;
    };
    assert.equal(firstPublishedNotification.userId, userId);
    assert.equal(firstPublishedNotification.type, 'inventory_session_closed');

    const [notificationAfterCrash, outboxAfterCrash] = await Promise.all([
      prisma.notification.findMany({ where: { outboxId } }),
      prisma.notificationOutbox.findUniqueOrThrow({ where: { id: outboxId } }),
    ]);
    assert.equal(notificationAfterCrash.length, 1, 'notification upsert must commit before publish');
    assert.equal(notificationAfterCrash[0]?.id, firstPublishedNotification.id);
    assert.equal(outboxAfterCrash.status, 'running', 'SIGKILL must leave the delivery lease recoverable');
    assert.equal(outboxAfterCrash.attempts, 1);

    await prisma.notificationOutbox.update({
      where: { id: outboxId },
      data: { leaseUntil: new Date(Date.now() - 1_000) },
    });
    const replayedSignals: Array<{ id: string; userId: string; type: string }> = [];
    const notifications = new NotificationsService(
      prisma,
      {} as never,
      {} as never,
      {
        emitNotificationCreated: (_userId: string, notification: { id: string; userId: string; type: string }) => {
          replayedSignals.push(notification);
        },
      } as never,
      {} as never,
    );
    await new NotificationOutboxRelayService(prisma, notifications).relayPendingOutbox();

    const [notificationsAfterReplay, outboxAfterReplay] = await Promise.all([
      prisma.notification.findMany({ where: { outboxId } }),
      prisma.notificationOutbox.findUniqueOrThrow({ where: { id: outboxId } }),
    ]);
    assert.equal(replayedSignals.length, 1, 'expired lease must replay the publish attempt');
    assert.equal(replayedSignals[0]?.id, firstPublishedNotification.id);
    assert.equal(notificationsAfterReplay.length, 1, 'replay must not create a duplicate durable notification');
    assert.equal(notificationsAfterReplay[0]?.id, firstPublishedNotification.id);
    assert.equal(outboxAfterReplay.status, 'delivered');
    assert.equal(outboxAfterReplay.attempts, 2);
    assert.equal(outboxAfterReplay.leaseToken, null);
    assert.equal(outboxAfterReplay.leaseUntil, null);
    assert.equal(outboxAfterReplay.lastError, null);

    console.log('Verified outbox crash-after-publish: replay may republish the same notification ID but leaves one durable Notification row.');
  } finally {
    try {
      if (connected) {
        await prisma.notification.deleteMany({ where: { outboxId } });
        await prisma.notificationOutbox.deleteMany({ where: { id: outboxId } });
        await prisma.user.deleteMany({ where: { id: userId } });
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
      await prisma.$disconnect();
    }
  }
};

const crashId = process.env.NOTIFICATION_OUTBOX_CRASH_ID;
const publishMarker = process.env.NOTIFICATION_OUTBOX_PUBLISH_MARKER;
if (crashId && publishMarker) {
  void crashAfterPublish(crashId, publishMarker).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
