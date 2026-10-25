import assert from 'node:assert/strict';
import { PrismaService } from '../src/prisma/prisma.service';
import type { RedisService } from '../src/redis/redis.service';
import type { NotificationsService } from '../src/modules/notifications/notifications.service';
import { SETTINGS_REGISTRY } from '../src/modules/settings/settings.registry';
import { SettingsService } from '../src/modules/settings/settings.service';

const main = async (): Promise<void> => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ''));
  if (
    process.env.NODE_ENV !== 'test' ||
    !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
    databaseName !== 'inventory_ci'
  ) {
    throw new Error('Settings-default integration check is restricted to the local inventory_ci test database');
  }

  const prisma = new PrismaService();
  const keys = SETTINGS_REGISTRY.map(({ key }) => key);
  const appNameDefinition = SETTINGS_REGISTRY.find(({ key }) => key === 'app.name');
  assert.ok(appNameDefinition);
  const invalidatedKeys: string[] = [];
  const redis = {
    del: async (...cacheKeys: string[]) => {
      invalidatedKeys.push(...cacheKeys);
    },
  } as unknown as RedisService;
  const settingsService = new SettingsService(prisma, redis, {} as NotificationsService);
  let connected = false;

  try {
    await prisma.$connect();
    connected = true;
    await prisma.setting.upsert({
      where: { key: appNameDefinition.key },
      create: {
        key: appNameDefinition.key,
        scope: 'private',
        valueType: 'number',
        value: '777',
        description: 'stale startup metadata',
      },
      update: { value: '777' },
    });

    // Concurrent calls model two application replicas running OnModuleInit.
    await Promise.all([settingsService.ensureDefaults(), settingsService.ensureDefaults()]);

    const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
    assert.equal(rows.length, SETTINGS_REGISTRY.length, 'every registry key must have exactly one row');
    const appNameRow = rows.find(({ key }) => key === appNameDefinition.key);
    assert.ok(appNameRow);
    assert.equal(appNameRow.value, '777', 'startup must not overwrite configured values');
    assert.equal(appNameRow.scope, appNameDefinition.scope, 'stale registry metadata must be reconciled');
    assert.equal(appNameRow.valueType, appNameDefinition.valueType);
    assert.equal(appNameRow.description, appNameDefinition.description);
    assert.equal(
      invalidatedKeys.length,
      SETTINGS_REGISTRY.length * 2,
      'both committed startup passes must invalidate cached rows',
    );

    console.log('Verified concurrent, transactional settings defaults and cache invalidation.');
  } finally {
    try {
      if (connected) {
        await prisma.setting.deleteMany({ where: { key: { in: keys } } });
      }
    } finally {
      await prisma.$disconnect();
    }
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
