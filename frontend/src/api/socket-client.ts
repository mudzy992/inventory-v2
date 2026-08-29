import { io, type Socket } from 'socket.io-client';
import { getApiBaseUrl } from './api-base';
import { getAccessToken } from './token-storage';

const POLL_INTERVAL_MS = 60_000;

let sharedSocket: Socket | null = null;
let sharedToken: string | null = null;

// API_BASE je ili puni URL (produkcija, npr. https://api.evidens.ba101.top —
// bez path-prefiksa otkad backend ima svoju subdomenu) ili relativni put
// (dev, "/backend" preko Vite proxy-ja). Origin i socket.io path se izvode
// iz istog izvora istine, tako da rade i sa i bez prefiksa bez hardkodovanja.
const resolveSocketOrigin = (): string => {
  const apiBase = getApiBaseUrl();
  if (apiBase.startsWith('http')) {
    try {
      return new URL(apiBase).origin;
    } catch {
      return window.location.origin;
    }
  }
  return window.location.origin;
};

const resolveSocketPath = (): string => {
  const apiBase = getApiBaseUrl();
  try {
    const url = new URL(apiBase, window.location.origin);
    const trimmedPath = url.pathname.replace(/\/+$/, '');
    return `${trimmedPath}/socket.io`;
  } catch {
    return '/socket.io';
  }
};

export const createNotificationsSocket = (token: string): Socket =>
  io(`${resolveSocketOrigin()}/notifications`, {
    path: resolveSocketPath(),
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

export const reconnectNotificationsSocket = (): Socket | null => {
  destroyNotificationsSocket();
  const token = getAccessToken();
  if (!token) {
    return null;
  }
  return getOrCreateNotificationsSocket(token);
};

export const NOTIFICATION_POLL_INTERVAL_MS = POLL_INTERVAL_MS;
