import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DocumentJobsService } from '../src/modules/documents/document-jobs.service';
import { NotificationOutboxRelayService } from '../src/modules/notifications/notification-outbox-relay.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';

const SOURCE_TYPE = 'ci-document-terminal-outbox';

const assertTestDatabase = (): void => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ''));
  if (
    process.env.NODE_ENV !== 'test' ||
    !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
    databaseName !== 'inventory_ci'
  ) {
    throw new Error('Document terminal outbox check is restricted to the local inventory_ci test database');
  }
};

const main = async (): Promise<void> => {
  assertTestDatabase();
  const prisma = new PrismaService();
  const userId = randomUUID();
  const doneJobId = randomUUID();
  const failedJobId = randomUUID();
  const doneSourceId = randomUUID();
  const failedSourceId = randomUUID();
  const doneKey = `document-job-terminal:${doneJobId}:done`;
  const failedKey = `document-job-terminal:${failedJobId}:failed`;
  let connected = false;

  try {
    await prisma.$connect();
    connected = true;

    await prisma.user.create({
      data: {
        id: userId,
        username: `ci-document-terminal-outbox-${userId}`,
        passwordHash: 'ci-not-a-login-hash',
        role: 'admin',
        isActive: true,
      },
    });

    for (const [id, sourceId, resultPath] of [
      [doneJobId, doneSourceId, 'ci/document-terminal-outbox/done.pdf'],
      [failedJobId, failedSourceId, 'ci/document-terminal-outbox/failed.pdf'],
    ] as const) {
      await prisma.documentJob.create({
        data: {
          id,
          sourceType: SOURCE_TYPE,
          sourceId,
          sourceFormat: 'docx',
          targetFormat: 'pdf',
          sourceRelativePath: 'ci/document-terminal-outbox/source.docx',
          resultRelativePath: resultPath,
          requestedByUserId: userId,
          status: 'queued',
        },
      });
    }

    const documentJobs = new DocumentJobsService(prisma);
    assert.equal((await documentJobs.markDone(doneJobId))?.status, 'done');
    assert.equal((await documentJobs.markFailed(failedJobId, 'Konverzija nije uspjela.', 2))?.status, 'failed');

    const pendingOutbox = await prisma.notificationOutbox.findMany({
      where: { idempotencyKey: { in: [doneKey, failedKey] } },
      orderBy: { createdAt: 'asc' },
    });
    assert.equal(pendingOutbox.length, 2, 'both terminal transitions must persist durable outbox rows');
    assert.ok(pendingOutbox.every((row) => row.userId === userId && row.status === 'pending'));

    const emitted: Array<{ userId: string; notification: Record<string, unknown> }> = [];
    const gateway = {
      emitNotificationCreated: (recipientId: string, notification: Record<string, unknown>) => {
        emitted.push({ userId: recipientId, notification });
      },
      emitInventoryDisposalInboxUpdated: () => undefined,
    } as never;
    const notificationsService = new NotificationsService(
      prisma,
      {} as never,
      {} as never,
      gateway,
      {} as never,
    );
    const relay = new NotificationOutboxRelayService(prisma, notificationsService);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const undelivered = await prisma.notificationOutbox.count({
        where: { idempotencyKey: { in: [doneKey, failedKey] }, status: { not: 'delivered' } },
      });
      if (undelivered === 0) break;
      await relay.relayPendingOutbox();
    }

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    assert.equal(notifications.length, 2, 'relay must create exactly one durable Notification per outbox row');
    const byRelatedId = new Map(notifications.map((row) => [row.relatedId, row]));
    const doneNotification = byRelatedId.get(doneJobId);
    const failedNotification = byRelatedId.get(failedJobId);
    assert.ok(doneNotification);
    assert.ok(failedNotification);
    assert.equal(doneNotification.type, 'info');
    assert.equal(doneNotification.title, 'Generisanje dokumenta završeno');
    assert.equal(doneNotification.message, 'Generisani dokument je spreman za preuzimanje.');
    assert.equal(failedNotification.type, 'info');
    assert.equal(failedNotification.title, 'Generisanje dokumenta nije uspjelo');
    assert.equal(failedNotification.message, 'Generisanje dokumenta nije uspjelo. Konverzija nije uspjela.');
    assert.ok(notifications.every((row) => row.outboxId));

    const deliveredOutbox = await prisma.notificationOutbox.findMany({
      where: { idempotencyKey: { in: [doneKey, failedKey] } },
    });
    assert.ok(deliveredOutbox.every((row) => row.status === 'delivered' && row.deliveredAt));

    const userEmissions = emitted.filter((entry) => entry.userId === userId);
    assert.equal(userEmissions.length, 2, 'relay must emit notification.created for both terminal results');
    assert.deepEqual(
      new Set(userEmissions.map((entry) => entry.notification.relatedId)),
      new Set([doneJobId, failedJobId]),
    );

    await relay.relayPendingOutbox();
    assert.equal(
      await prisma.notification.count({ where: { userId } }),
      2,
      'relay replay must not duplicate durable notifications',
    );
    assert.equal(
      emitted.filter((entry) => entry.userId === userId).length,
      2,
      'relay replay must not repeat terminal socket signals',
    );

    console.log('Verified DocumentJob terminal outbox rows deliver exactly one durable notification and signal.');
  } finally {
    if (connected) {
      await prisma.notification.deleteMany({ where: { userId } });
      await prisma.notificationOutbox.deleteMany({ where: { userId } });
      await prisma.documentJob.deleteMany({
        where: { sourceType: SOURCE_TYPE, sourceId: { in: [doneSourceId, failedSourceId] } },
      });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  }
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(error);
  console.log(`::error title=DocumentJob terminal outbox relay::${message.replaceAll('%', '%25').replaceAll(/[\r\n]/gu, ' ')}`);
  process.exitCode = 1;
});
