import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RedisService } from '../../redis/redis.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { SETTINGS_REGISTRY } from './settings.registry';
import { SettingsService } from './settings.service';

type UpsertArgs = Record<string, unknown>;

const createService = (options: { failTransaction?: Error } = {}) => {
  const upsertCalls: UpsertArgs[] = [];
  const transactions: number[] = [];
  const invalidatedKeys: string[] = [];
  const prisma = {
    setting: {
      upsert: (args: UpsertArgs) => {
        upsertCalls.push(args);
        return Promise.resolve(undefined);
      },
    },
    $transaction: async (operations: Promise<unknown>[]) => {
      transactions.push(operations.length);
      if (options.failTransaction) throw options.failTransaction;
      return Promise.all(operations);
    },
  } as unknown as PrismaService;
  const redis = {
    del: async (...keys: string[]) => {
      invalidatedKeys.push(...keys);
    },
  } as unknown as RedisService;
  const notifications = {} as NotificationsService;
  return {
    service: new SettingsService(prisma, redis, notifications),
    upsertCalls,
    transactions,
    invalidatedKeys,
  };
};

test('ensureDefaults uses one idempotent upsert transaction and invalidates cached values after commit', async () => {
  const { service, upsertCalls, transactions, invalidatedKeys } = createService();

  await service.ensureDefaults();

  assert.deepEqual(transactions, [SETTINGS_REGISTRY.length]);
  assert.equal(upsertCalls.length, SETTINGS_REGISTRY.length);
  assert.deepEqual(
    upsertCalls.map((args) => (args.where as { key: string }).key),
    SETTINGS_REGISTRY.map(({ key }) => key),
  );
  for (const args of upsertCalls) {
    const update = args.update as Record<string, unknown>;
    assert.equal('value' in update, false, 'startup must preserve administrator-configured values');
  }
  assert.deepEqual(
    invalidatedKeys,
    SETTINGS_REGISTRY.map(({ key }) => `settings:row:${key}`),
  );
});

test('ensureDefaults does not invalidate cache when the defaults transaction fails', async () => {
  const failure = new Error('transaction rolled back');
  const { service, invalidatedKeys } = createService({ failTransaction: failure });

  await assert.rejects(service.ensureDefaults(), failure);
  assert.deepEqual(invalidatedKeys, []);
});
