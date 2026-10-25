import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureDisposalPendingApproval } from './ensure-disposal-pending-approval.util';

const input = {
  equipmentId: 'equipment-1',
  disposalCommissionId: 'commission-1',
  sessionId: 'session-current',
  inventoryLineId: 'line-1',
};

test('same-session retry preserves a reviewed disposal approval', async () => {
  const calls: string[] = [];
  const reviewed = { id: 'approval-1', status: 'approved', equipment: { inventoryNumber: 'INV-1' } };
  const store = {
    disposalInventoryApproval: {
      findUnique: async () => ({ id: 'approval-1', sessionId: input.sessionId, status: 'approved' }),
      findUniqueOrThrow: async () => reviewed,
      updateMany: async () => {
        calls.push('updateMany');
        return { count: 0 };
      },
      upsert: async () => {
        calls.push('upsert');
        return reviewed;
      },
    },
  };

  const result = await ensureDisposalPendingApproval(store as never, input);

  assert.equal(result, reviewed);
  assert.deepEqual(calls, []);
});

test('same-session retry only changes the line link while approval remains pending', async () => {
  let updateWhere: unknown;
  let updateData: unknown;
  const pending = { id: 'approval-1', status: 'pending', equipment: { inventoryNumber: 'INV-1' } };
  const store = {
    disposalInventoryApproval: {
      findUnique: async () => ({ id: 'approval-1', sessionId: input.sessionId, status: 'pending' }),
      updateMany: async (args: { where: unknown; data: unknown }) => {
        updateWhere = args.where;
        updateData = args.data;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => pending,
      upsert: async () => assert.fail('same-session retry must not use upsert'),
    },
  };

  const result = await ensureDisposalPendingApproval(store as never, input);

  assert.equal(result, pending);
  assert.deepEqual(updateWhere, { id: 'approval-1', sessionId: input.sessionId, status: 'pending' });
  assert.deepEqual(updateData, { inventoryLineId: input.inventoryLineId });
});

test('a new inventory session reopens an existing approval', async () => {
  let upsertArgs: unknown;
  const reopened = { id: 'approval-1', status: 'pending', equipment: { inventoryNumber: 'INV-1' } };
  const store = {
    disposalInventoryApproval: {
      findUnique: async () => ({ id: 'approval-1', sessionId: 'session-previous', status: 'approved' }),
      upsert: async (args: unknown) => {
        upsertArgs = args;
        return reopened;
      },
    },
  };

  const result = await ensureDisposalPendingApproval(store as never, input);

  assert.equal(result, reopened);
  assert.deepEqual(upsertArgs, {
    where: {
      equipmentId_disposalCommissionId: {
        equipmentId: input.equipmentId,
        disposalCommissionId: input.disposalCommissionId,
      },
    },
    create: {
      equipmentId: input.equipmentId,
      disposalCommissionId: input.disposalCommissionId,
      sessionId: input.sessionId,
      inventoryLineId: input.inventoryLineId,
      status: 'pending',
    },
    update: {
      sessionId: input.sessionId,
      status: 'pending',
      inventoryLineId: input.inventoryLineId,
      reviewedByUserId: null,
      reviewNote: null,
      reviewedAt: null,
    },
    include: { equipment: { select: { inventoryNumber: true } } },
  });
});
