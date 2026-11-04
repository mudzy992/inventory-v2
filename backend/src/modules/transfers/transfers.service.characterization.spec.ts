import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { TransfersService } from './transfers.service';

const source = readFileSync(resolve('src/modules/transfers/transfers.service.ts'), 'utf8');
const makeService = () => new TransfersService(
  {} as never, {} as never, {} as never, {} as never, {} as never,
  {} as never, {} as never, {} as never, {} as never, {} as never,
  {} as never, {} as never,
);

test('finalize rejects plain users before any database access', async () => {
  const service = makeService();
  await assert.rejects(
    service.finalize({ id: 'u1', role: 'user' } as never, 't1', { signerId: 's1' } as never),
    /Users cannot finalize/u,
  );
});

test('transfer state transitions are conditional claims, never blind writes', () => {
  assert.match(source, /claimTransferForFinalizeInTx\(/u);
  assert.match(source, /generatedDocxStatus/u);
  assert.doesNotMatch(source, /\bconsole\./u);
});

test('finalizes an uploaded transfer, updates equipment and enqueues notification within the transaction', async () => {
  const events: string[] = [];
  const transfer = {
    id: 't1', status: 'uploaded', type: 'prenos', scannedDocUrl: '/signed.pdf',
    equipmentId: 'e1', equipment: { currentHolder: null }, signerId: 's1',
    toPersonId: 'recipient', toWarehouseId: null, fromPerson: { orgUnitId: 'org1' },
    documentWarehouseId: 'w1', documentNumber: '1-11/2026', date: new Date('2026-11-04'),
    isCrossServiceTransfer: false,
  };
  const updated = { ...transfer, status: 'potpisan', generatedDocxStatus: 'queued' };
  const tx = {
    transfer: {
      updateMany: async (args: { where: { id: string; status: { in: string[] } }; data: { status: string } }) => {
        events.push('claim');
        assert.equal(args.where.id, 't1');
        assert.ok(args.where.status.in.includes('uploaded'));
        assert.equal(args.data.status, 'potpisan');
        return { count: 1 };
      },
      findUniqueOrThrow: async () => { events.push('read'); return updated; },
    },
    equipment: {
      update: async (args: { where: { id: string }; data: { currentHolderId: string } }) => {
        events.push('equipment');
        assert.equal(args.where.id, 'e1');
        assert.equal(args.data.currentHolderId, 'recipient');
      },
    },
  };
  const prisma = {
    transfer: { findUnique: async () => transfer },
    employee: { findUnique: async () => ({ id: 's1' }) },
    warehouse: { findUnique: async () => ({ isActive: true, orgUnitId: 'org1' }) },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      events.push('begin');
      const result = await callback(tx);
      events.push('commit');
      return result;
    },
  };
  const notifications = {
    notificationsEnabled: async () => true,
    enqueueTransferOutboxEventsInTx: async (client: unknown, id: string, action: string, options: unknown) => {
      events.push('outbox');
      assert.equal(client, tx);
      assert.equal(id, 't1');
      assert.equal(action, 'signed');
      assert.deepEqual(options, { notificationsEnabled: true });
    },
  };
  const generation = {
    tryGenerateForTransfer: async (id: string, userId: string) => {
      events.push('generate');
      assert.equal(id, 't1');
      assert.equal(userId, 'u1');
    },
  };
  const service = new TransfersService(
    prisma as never, { canAccessTransfer: async () => true } as never,
    { isModerator: () => false } as never, {} as never, {} as never,
    notifications as never, {} as never, {} as never, {} as never,
    { assertTransferFinalizeAllowed: async () => undefined } as never,
    {} as never, generation as never,
  );
  const result = await service.finalize({ id: 'u1', role: 'admin' } as never, 't1', {} as never);
  assert.equal(result.id, 't1');
  assert.equal(result.status, 'potpisan');
  assert.equal(result.documentGenerationStatus, 'queued');
  assert.deepEqual(events, ['begin', 'claim', 'read', 'equipment', 'outbox', 'commit', 'generate']);
});
