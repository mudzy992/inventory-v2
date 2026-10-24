import assert from 'node:assert/strict';
import test from 'node:test';
import type { Socket } from 'socket.io';
import { NotificationsGateway } from './notifications.gateway';

const createGateway = (isActive: boolean | null) => {
  const disconnected: boolean[] = [];
  const joined: string[] = [];
  const gateway = new NotificationsGateway(
    { verify: () => ({ sub: 'user-1' }) } as never,
    { getOrThrow: () => 'test-secret' } as never,
    {
      user: {
        findUnique: async () => (isActive === null ? null : { isActive }),
      },
    } as never,
  );
  const client = {
    handshake: { auth: { token: 'test-token' }, headers: {} },
    data: {},
    disconnect: (close: boolean) => disconnected.push(close),
    join: async (room: string) => {
      joined.push(room);
    },
  } as unknown as Socket;
  return { gateway, client, disconnected, joined };
};

test('allows an active account to join its private notification room', async () => {
  const { gateway, client, disconnected, joined } = createGateway(true);
  await gateway.handleConnection(client);
  assert.equal(client.data.userId, 'user-1');
  assert.deepEqual(joined, ['user:user-1']);
  assert.deepEqual(disconnected, []);
});

test('disconnects inactive and missing accounts during the handshake', async () => {
  for (const activeState of [false, null]) {
    const { gateway, client, disconnected, joined } = createGateway(activeState);
    await gateway.handleConnection(client);
    assert.deepEqual(disconnected, [true]);
    assert.deepEqual(joined, []);
  }
});
