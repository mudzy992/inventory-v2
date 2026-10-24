import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaService } from '../../prisma/prisma.service';
import { claimRefreshTokenForRotation } from './refresh-token-rotation.util';

test('claims a valid, unrevoked, unexpired refresh token exactly once', async () => {
  const now = new Date('2026-10-24T12:00:00.000Z');
  let receivedArgs: unknown;
  const store = {
    refreshToken: {
      updateMany: async (args: unknown) => {
        receivedArgs = args;
        return { count: 1 };
      },
    },
  } as unknown as Pick<PrismaService, 'refreshToken'>;

  assert.equal(await claimRefreshTokenForRotation(store, 'token-row-id', now), true);
  assert.deepEqual(receivedArgs, {
    where: {
      id: 'token-row-id',
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: { revokedAt: now },
  });
});

test('reports a lost concurrent rotation claim', async () => {
  const store = {
    refreshToken: {
      updateMany: async () => ({ count: 0 }),
    },
  } as unknown as Pick<PrismaService, 'refreshToken'>;

  assert.equal(
    await claimRefreshTokenForRotation(store, 'already-revoked-row', new Date()),
    false,
  );
});
