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

test('findEffective returns the 7 whitelisted setting keys with their database or default values', async () => {
  const { service } = createService();
  // Mock getRow to return null for all keys so defaults are used
  const originalGetRow = (service as any).getRow.bind(service);
  (service as any).getRow = async () => null;

  const result = await service.findEffective();

  assert.equal(typeof result, 'object');
  assert.ok('transfer.allow_finalize_without_upload' in result);
  assert.ok('transfer.allow_evidenticar_cross_city' in result);
  assert.ok('transfer.generation.enabled' in result);
  assert.ok('upload.max_mb' in result);
  assert.ok('transfer.require_signed_pdf_upload' in result);
  assert.ok('features.moderator_role' in result);
  // 'features.inventory_manual_committee_create' je uklonjen iz registra
  // (Modul A, BM-2 opcija B) i ne smije biti u efektivnoj whitelist-i.
  assert.ok(!('features.inventory_manual_committee_create' in result));
  assert.ok('inventory.auto_create_draft_session' in result);
  assert.equal(Object.keys(result).length, 7);
  // Restore mock (not strictly needed since service is isolated)
  (service as any).getRow = originalGetRow;
});

test('ensureDefaults does not invalidate cache when the defaults transaction fails', async () => {
  const failure = new Error('transaction rolled back');
  const { service, invalidatedKeys } = createService({ failTransaction: failure });

  await assert.rejects(service.ensureDefaults(), failure);
  assert.deepEqual(invalidatedKeys, []);
});
