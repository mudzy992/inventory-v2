import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { UnauthorizedException } from '@nestjs/common';
import Redis from 'ioredis';
import {
  USER_AUTH_CACHE_TTL_SECONDS,
  authRevocationKey,
  authUserCacheKey,
  buildCachedAuthenticatedUser,
  parseAuthRevocationMarker,
  type CachedAuthenticatedUser,
} from '../src/modules/auth/auth-cache.util';
import {
  prepareUserSessionRevocation,
  revokeRefreshTokensInTransaction,
} from '../src/modules/auth/auth-session-revocation.util';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

/**
 * Live proof (real Redis 7 + real PostgreSQL) that deactivating a user cannot
 * leave a usable cached identity or refresh token behind, and that a late
 * fire-and-forget cache write cannot resurrect it.
 *
 * `--static` runs only the repository policy gate (no services required).
 */

const ROOT = resolve('.');
const SRC = resolve(ROOT, 'src');

const staticChecks = (): void => {
  const users = readFileSync(resolve(SRC, 'modules/users/users.service.ts'), 'utf8');
  const employees = readFileSync(resolve(SRC, 'modules/employees/employees.service.ts'), 'utf8');
  const auth = readFileSync(resolve(SRC, 'modules/auth/auth.service.ts'), 'utf8');
  const strategy = readFileSync(resolve(SRC, 'modules/auth/strategies/jwt.strategy.ts'), 'utf8');

  for (const [name, source] of [
    ['UsersService', users],
    ['EmployeesService', employees],
  ] as const) {
    assert.match(source, /prepareUserSessionRevocation\(/u, `${name} must write the marker pre-commit`);
    assert.match(
      source,
      /revokeRefreshTokensInTransaction\(tx,/u,
      `${name} must revoke refresh tokens inside the transaction`,
    );
    assert.doesNotMatch(
      source,
      /redisService\.del\(authUserCacheKey/u,
      `${name} must not rely on a best-effort cache delete alone`,
    );
    assert.match(
      source,
      /disconnectUserSockets\(/u,
      `${name} must disconnect live WebSocket sessions on deactivation`,
    );
  }
  const gateway = readFileSync(resolve(SRC, 'modules/notifications/notifications.gateway.ts'), 'utf8');
  assert.match(gateway, /notifications_user_sockets_disconnected/u);
  assert.match(users, /isChangingPassword/u, 'password change must be detected');
  assert.match(
    users,
    /isDeactivatingUser \|\| isChangingPassword/u,
    'password change must revoke refresh tokens in the same transaction',
  );
  assert.match(users, /'password_changed'/u);
  assert.match(
    auth,
    /\$transaction\(async \(tx\) => \{[\s\S]{0,600}tx\.user\.findUnique\(/u,
    'AuthService.refresh must re-check isActive inside the rotation transaction',
  );
  assert.match(auth, /isActive:\s*true/u);
  for (const expected of ['isFreshAuthCache', 'authRevocationKey', 'readStartedAt']) {
    assert.ok(strategy.includes(expected), `JwtStrategy must use ${expected}`);
  }
};

const liveChecks = async (): Promise<void> => {
  const prisma = new PrismaService();
  const redis = new Redis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? '6379'),
    maxRetriesPerRequest: 1,
    lazyConnect: false,
  });
  redis.on('error', () => {});
  const userId = randomUUID();
  const username = `ci-auth-revoke-${userId}`;
  const payload = { sub: userId, username, role: 'admin' as const };
  let connected = false;

  try {
    await prisma.$connect();
    connected = true;
    await redis.ping();

    await prisma.user.create({
      data: { id: userId, username, passwordHash: 'ci-not-a-login-hash', role: 'admin' },
    });
    for (let index = 0; index < 2; index += 1) {
      await prisma.refreshToken.create({
        data: {
          userId,
          tokenHash: randomBytes(32).toString('hex'),
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
    }

    const strategy = new JwtStrategy(
      { getOrThrow: () => 'ci-secret' } as never,
      prisma,
      new RedisService(redis),
    );

    // 1. A normal request caches the identity.
    const before = await strategy.validate(payload);
    assert.equal(before.id, userId);
    const cachedRaw = await redis.get(authUserCacheKey(userId));
    assert.ok(cachedRaw, 'JwtStrategy must populate the auth cache');
    const cached = JSON.parse(cachedRaw) as CachedAuthenticatedUser;
    assert.equal(typeof cached.cachedAt, 'number');

    // 2. Deactivation is marker-first, then user + refresh tokens in ONE tx.
    const marker = await prepareUserSessionRevocation(redis, userId, 'user_deactivated');
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { isActive: false } });
      await revokeRefreshTokensInTransaction(tx, userId, new Date());
    });

    const tokens = await prisma.refreshToken.findMany({ where: { userId } });
    assert.equal(tokens.length, 2);
    assert.ok(tokens.every((token) => token.revokedAt !== null), 'all refresh tokens must be revoked');

    // 3. The marker forces a DB read; the inactive user is rejected even
    //    though a stale cache entry could still be written by an in-flight
    //    request (simulated explicitly below).
    await assert.rejects(strategy.validate(payload), UnauthorizedException);

    const markerTtl = await redis.ttl(authRevocationKey(userId));
    assert.ok(
      markerTtl > USER_AUTH_CACHE_TTL_SECONDS,
      `revocation marker TTL ${markerTtl}s must outlive the ${USER_AUTH_CACHE_TTL_SECONDS}s cache`,
    );
    const storedMarker = parseAuthRevocationMarker(
      JSON.parse((await redis.get(authRevocationKey(userId))) ?? 'null'),
    );
    assert.deepEqual(storedMarker, marker);

    await redis.set(
      authUserCacheKey(userId),
      JSON.stringify(buildCachedAuthenticatedUser(before, marker.revokedAt - 1)),
      'EX',
      USER_AUTH_CACHE_TTL_SECONDS,
    );
    await assert.rejects(
      strategy.validate(payload),
      UnauthorizedException,
      'a late cache write older than the marker must not resurrect the identity',
    );

    // 4. A failed Redis marker write is fail-closed (no silent stale session).
    await assert.rejects(
      prepareUserSessionRevocation(
        {
          set: async () => null,
          del: async () => 1,
        },
        userId,
        'user_deactivated',
      ),
      /Cannot revoke sessions/u,
    );

    // 5. Reactivation is not permanently blocked: a cache entry newer than
    //    the old marker is accepted again.
    await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
    await redis.set(
      authUserCacheKey(userId),
      JSON.stringify(buildCachedAuthenticatedUser(before, marker.revokedAt + 1)),
      'EX',
      USER_AUTH_CACHE_TTL_SECONDS,
    );
    assert.equal((await strategy.validate(payload)).id, userId);

    console.log(
      'Auth session revocation check passed (marker-first invalidation, atomic refresh-token revocation, stale/late cache writes rejected, fail-closed Redis write, reactivation works).',
    );
  } finally {
    await redis.del(authUserCacheKey(userId), authRevocationKey(userId)).catch(() => undefined);
    redis.disconnect();
    if (connected) {
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  }
};

const main = async (): Promise<void> => {
  staticChecks();
  if (process.argv.includes('--static')) {
    console.log('Auth session revocation contract passed (static repository policy; live part skipped).');
    return;
  }
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ''));
  if (
    process.env.NODE_ENV !== 'test' ||
    !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
    databaseName !== 'inventory_ci'
  ) {
    throw new Error(
      'Auth session revocation live check is restricted to the local inventory_ci test database',
    );
  }
  await liveChecks();
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
