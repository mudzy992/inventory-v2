import { io, type Socket } from 'socket.io-client';
import { getApiBaseUrl } from '../api/client';

const SOCKET_PATH = '/backend/socket.io';
const POLL_INTERVAL_MS = 60_000;

let sharedSocket: Socket | null = null;
let sharedToken: string | null = null;

const resolveSocketOrigin = (): string => {
  const apiBase = getApiBaseUrl();
  if (apiBase.startsWith('http')) {
    return apiBase.replace(/\/backend\/?$/, '');
  }
  return window.location.origin;
};

export const createNotificationsSocket = (token: string): Socket =>
  io(`${resolveSocketOrigin()}/notifications`, {
    path: SOCKET_PATH,
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

export const getOrCreateNotificationsSocket = (token: string): Socket => {
  if (sharedSocket && sharedToken === token) {
    return sharedSocket;
  }
  if (sharedSocket) {
    sharedSocket.removeAllListeners();
    sharedSocket.disconnect();
  }
  sharedToken = token;
  sharedSocket = createNotificationsSocket(token);
  return sharedSocket;
};

export const destroyNotificationsSocket = (): void => {
  if (sharedSocket) {
    sharedSocket.removeAllListeners();
    sharedSocket.disconnect();
    sharedSocket = null;
    sharedToken = null;
  }
};

export const NOTIFICATION_POLL_INTERVAL_MS = POLL_INTERVAL_MS;
