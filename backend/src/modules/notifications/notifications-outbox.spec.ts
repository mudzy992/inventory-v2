import assert from 'node:assert/strict';
import test from 'node:test';
import { NotificationsService } from './notifications.service';
import { NotificationOutboxRelayService } from './notification-outbox-relay.service';

test('creates idempotent disposal-approval outbox rows in the caller transaction', async () => {
  let inserted: unknown;
  const tx = {
    disposalCommissionMember: {
      findMany: async () => [{ employeeId: 'employee-1' }, { employeeId: 'employee-2' }],
    },
    user: { findMany: async () => [{ id: 'user-1' }, { id: 'user-2' }] },
    notificationOutbox: {
      createMany: async (args: unknown) => {
        inserted = args;
        return { count: 2 };
      },
    },
  };
  const service = new NotificationsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  await service.enqueueDisposalApprovalPendingOutboxInTx(tx as never, {
    approvalId: 'approval-1',
    sessionId: 'session-1',
    commissionId: 'commission-1',
    inventoryLabel: 'INV-42',
  });

  assert.deepEqual(inserted, {
    data: [
      {
        idempotencyKey: 'inventory-disposal-approval:session-1:approval-1:user-1',
        userId: 'user-1',
        type: 'disposal_approval_pending',
        title: 'Nova odluka o rashodu',
        message: 'Rashodna komisija je otvorila predmet za INV-42. Pregledajte stavku i glasajte.',
        relatedId: 'approval-1',
        sessionId: 'session-1',
        refreshDisposalInbox: true,
      },
      {
        idempotencyKey: 'inventory-disposal-approval:session-1:approval-1:user-2',
        userId: 'user-2',
        type: 'disposal_approval_pending',
        title: 'Nova odluka o rashodu',
        message: 'Rashodna komisija je otvorila predmet za INV-42. Pregledajte stavku i glasajte.',
        relatedId: 'approval-1',
        sessionId: 'session-1',
        refreshDisposalInbox: true,
      },
    ],
    skipDuplicates: true,
  });
});

test('upserts the durable notification by outbox id before emitting repeatable socket signals', async () => {
  let upsertArgs: unknown;
  const emitted: unknown[][] = [];
  const createdAt = new Date('2026-10-25T20:00:00.000Z');
  const service = new NotificationsService(
    {
      notification: {
        upsert: async (args: unknown) => {
          upsertArgs = args;
          return {
            id: 'notification-1',
            userId: 'user-1',
            type: 'disposal_approval_pending',
            title: 'Nova odluka o rashodu',
            message: 'Pregledajte stavku.',
            read: false,
            relatedId: 'approval-1',
            createdAt,
          };
        },
      },
    } as never,
    {} as never,
    {} as never,
    {
      emitNotificationCreated: (...args: unknown[]) => emitted.push(args),
      emitInventoryDisposalInboxUpdated: (...args: unknown[]) => emitted.push(args),
    } as never,
    {} as never,
  );

  await service.deliverOutboxNotification({
    id: 'outbox-1',
    userId: 'user-1',
    type: 'disposal_approval_pending',
    title: 'Nova odluka o rashodu',
    message: 'Pregledajte stavku.',
    relatedId: 'approval-1',
    sessionId: 'session-1',
    refreshDisposalInbox: true,
  } as never);

  assert.deepEqual(upsertArgs, {
    where: { outboxId: 'outbox-1' },
    create: {
      outboxId: 'outbox-1',
      userId: 'user-1',
      type: 'disposal_approval_pending',
      title: 'Nova odluka o rashodu',
      message: 'Pregledajte stavku.',
      relatedId: 'approval-1',
    },
    update: {},
  });
  assert.deepEqual(emitted, [
    [
      'user-1',
      {
        id: 'notification-1',
        userId: 'user-1',
        type: 'disposal_approval_pending',
        title: 'Nova odluka o rashodu',
        message: 'Pregledajte stavku.',
        read: false,
        relatedId: 'approval-1',
        createdAt: createdAt.toISOString(),
      },
    ],
    [['user-1'], { sessionId: 'session-1' }],
  ]);
});

test('enqueues transfer-created notifications with stable per-recipient idempotency keys', async () => {
  let inserted: { data: Array<Record<string, unknown>>; skipDuplicates: boolean } | undefined;
  const transfer = {
    id: 'transfer-1',
    status: 'raw',
    scannedDocUrl: null,
    signerId: 'employee-signer',
    fromPersonId: null,
    toPersonId: null,
    toType: 'skladiste',
    documentNumber: 'TR-2026-1',
    equipmentId: 'equipment-1',
    equipment: {
      inventoryNumber: 'INV-1',
      categoryId: 'category-1',
      currentHolder: { orgUnitId: 'org-1' },
      warehouse: null,
      warehouseId: null,
    },
  };
  const tx = {
    transfer: { findUnique: async () => transfer },
    user: {
      findMany: async (args: { where?: { role?: string } }) =>
        args.where?.role === 'admin' ? [{ id: 'admin-user' }] : [],
      findFirst: async () => ({ id: 'signer-user' }),
    },
    notificationOutbox: {
      createMany: async (args: { data: Array<Record<string, unknown>>; skipDuplicates: boolean }) => {
        inserted = args;
        return { count: args.data.length };
      },
    },
  };
  const service = new NotificationsService(
    {} as never,
    { resolveExpandedScopes: async () => ({ cityIds: new Set(['city-1']), categoryIds: new Set(['category-1']) }) } as never,
    { getEffectiveLocationForOrgUnit: async () => 'city-1' } as never,
    {} as never,
    {} as never,
  );

  await service.enqueueTransferOutboxEventsInTx(tx as never, transfer.id, 'created', {
    notificationsEnabled: true,
    includeUploadPending: true,
  });

  assert.equal(inserted?.skipDuplicates, true);
  assert.deepEqual(
    inserted?.data.map((row) => [row.idempotencyKey, row.userId, row.type]),
    [
      ['transfer:transfer-1:transfer_pending:admin-user', 'admin-user', 'transfer_pending'],
      ['transfer:transfer-1:transfer_pending:signer-user', 'signer-user', 'transfer_pending'],
      [
        'transfer:transfer-1:transfer_signed_upload_pending:admin-user',
        'admin-user',
        'transfer_signed_upload_pending',
      ],
      [
        'transfer:transfer-1:transfer_signed_upload_pending:signer-user',
        'signer-user',
        'transfer_signed_upload_pending',
      ],
    ],
  );
});

test('keeps failed outbox rows durable and schedules an exponential retry', async () => {
  const writes: Array<Record<string, unknown>> = [];
  const row = {
    id: 'outbox-2',
    userId: 'user-2',
    type: 'inventory_session_closed',
    title: 'Sesija popisa zatvorena',
    message: 'Sesija je zatvorena.',
    relatedId: 'session-2',
    status: 'pending',
    attempts: 0,
    leaseToken: null,
    leaseUntil: null,
    createdAt: new Date('2026-10-25T20:00:00.000Z'),
  };
  let leaseToken: string | null = null;
  const prisma = {
    notificationOutbox: {
      findMany: async () => [row],
      updateMany: async (args: Record<string, unknown>) => {
        writes.push(args);
        const data = args.data as Record<string, unknown>;
        if (data.status === 'running') {
          leaseToken = data.leaseToken as string;
        }
        return { count: 1 };
      },
      findUnique: async (args: Record<string, unknown>) => {
        if (args.select) {
          return { attempts: 1 };
        }
        return { ...row, status: 'running', attempts: 1, leaseToken };
      },
    },
  };
  const relay = new NotificationOutboxRelayService(
    prisma as never,
    { deliverOutboxNotification: async () => { throw new Error('temporary socket/database failure'); } } as never,
  );
  const before = Date.now();

  await relay.relayPendingOutbox();

  const retryWrite = writes.at(-1)?.data as Record<string, unknown>;
  assert.equal(retryWrite.status, 'pending');
  assert.equal(retryWrite.lastError, 'temporary socket/database failure');
  assert.ok(retryWrite.nextAttemptAt instanceof Date);
  assert.ok((retryWrite.nextAttemptAt as Date).getTime() >= before + 4_900);
  assert.ok((retryWrite.nextAttemptAt as Date).getTime() <= Date.now() + 5_100);
});
