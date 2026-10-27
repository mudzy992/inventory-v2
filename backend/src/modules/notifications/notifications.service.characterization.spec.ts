import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { NotificationsService } from './notifications.service';

const source = readFileSync(resolve('src/modules/notifications/notifications.service.ts'), 'utf8');

const makeService = () => {
  const emissions: unknown[][] = [];
  let createCalls = 0;
  const prisma = {
    notification: {
      createManyAndReturn: async ({ data }: { data: { userId: string }[] }) => {
        createCalls += 1;
        return data.map((row, index) => ({
          id: `n${index}`,
          userId: row.userId,
          type: 'info',
          title: 't', message: 'm', read: false, relatedId: null,
          outboxId: null, createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }));
      },
    },
  };
  const service = new NotificationsService(
    prisma as never,
    {} as never,
    {} as never,
    { emitNotificationCreated: (...args: unknown[]) => emissions.push(args) } as never,
    { getBooleanValue: async () => true } as never,
  );
  return { service, emissions, calls: () => createCalls };
};

test('notification fan-out uses one batched insert for many recipients', async () => {
  const { service, emissions, calls } = makeService();
  await (service as never as { createForUsers: (ids: string[], input: object) => Promise<void> }).createForUsers(
    ['u1', 'u2', 'u1'], { type: 'info', title: 't', message: 'm' },
  );
  assert.equal(calls(), 1, 'one INSERT regardless of recipient count');
  assert.equal(emissions.length, 2, 'duplicate recipient ids are de-duplicated');
});

test('notificationsEnabled reflects the settings flag', async () => {
  const { service } = makeService();
  assert.equal(await service.notificationsEnabled(), true);
  assert.match(source, /createManyAndReturn\(/u);
  assert.match(source, /buildWarehouseStockReceivedOutboxRows/u);
});
