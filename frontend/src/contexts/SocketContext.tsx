import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Socket } from 'socket.io-client';
import {
  fetchNotificationsApi,
  markAllNotificationsReadApi,
  markNotificationReadApi,
} from '../api/notifications-api';
import { getAccessToken, subscribeTokenChange } from '../api/token-storage';
import {
  destroyNotificationsSocket,
  getOrCreateNotificationsSocket,
  NOTIFICATION_POLL_INTERVAL_MS,
} from '../api/socket-client';
import {
  applyNotificationCreated,
  applyNotificationRead,
  applyNotificationsLoaded,
  getUnreadNotificationsCount,
} from '../store';
import type { Notification } from '../types';
import { useAuth } from './AuthContext';
import { usePublicSettings } from './public-settings-context';

interface SocketContextValue {
  notifications: Notification[];
  unreadCount: number;
  isConnected: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const { user, isAuthenticated } = useAuth();
  const { patchLocal, getBoolean } = usePublicSettings();
  const isRealtimeEnabled = getBoolean('notifications.realtime', true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [tokenRevision, setTokenRevision] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => subscribeTokenChange(() => setTokenRevision((n) => n + 1)), []);

  const refreshNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      applyNotificationsLoaded([]);
      return;
    }
    const rows = await fetchNotificationsApi();
    setNotifications(rows);
    applyNotificationsLoaded(rows);
  }, [user]);

  const markRead = useCallback(async (id: string) => {
    const updated = await markNotificationReadApi(id);
    setNotifications((prev) => prev.map((row) => (row.id === id ? updated : row)));
    applyNotificationRead(id);
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsReadApi();
    setNotifications((prev) => {
      const next = prev.map((row) => ({ ...row, read: true }));
      applyNotificationsLoaded(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      destroyNotificationsSocket();
      setNotifications([]);
      applyNotificationsLoaded([]);
      setIsConnected(false);
      return;
    }
    let active = true;
    const bootstrap = async () => {
      try {
        await refreshNotifications();
      } catch {
        if (active) {
          setNotifications([]);
        }
      }
    };
    void bootstrap();
    return () => {
      active = false;
    };
  }, [isAuthenticated, user, refreshNotifications]);

  useEffect(() => {
    if (!isAuthenticated || !user || !isRealtimeEnabled) {
      destroyNotificationsSocket();
      setIsConnected(false);
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const socket = getOrCreateNotificationsSocket(token);
    socketRef.current = socket;
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    const handleCreated = (notification: Notification) => {
      setNotifications((prev) => {
        if (prev.some((row) => row.id === notification.id)) {
          return prev;
        }
        return [notification, ...prev];
      });
      applyNotificationCreated(notification);
    };
    const handleRead = (payload: { id: string }) => {
      setNotifications((prev) =>
        prev.map((row) => (row.id === payload.id ? { ...row, read: true } : row)),
      );
      applyNotificationRead(payload.id);
    };
    const handleSettingsUpdated = (payload: { key: string; value: string | number | boolean }) => {
      patchLocal(payload.key, payload.value);
    };
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('notification.created', handleCreated);
    socket.on('notification.read', handleRead);
    socket.on('settings.updated', handleSettingsUpdated);
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('notification.created', handleCreated);
      socket.off('notification.read', handleRead);
      socket.off('settings.updated', handleSettingsUpdated);
      socketRef.current = null;
      setIsConnected(socket.connected);
    };
  }, [isAuthenticated, user, patchLocal, isRealtimeEnabled, tokenRevision]);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }
    if (isRealtimeEnabled && isConnected) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = window.setInterval(() => {
      void refreshNotifications();
    }, NOTIFICATION_POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isAuthenticated, user, isConnected, isRealtimeEnabled, refreshNotifications]);

  const unreadCount = user ? getUnreadNotificationsCount(user.id) : 0;

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      isConnected,
      markRead,
      markAllRead,
      refreshNotifications,
    }),
    [notifications, unreadCount, isConnected, markRead, markAllRead, refreshNotifications],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useNotifications = (): SocketContextValue => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useNotifications must be used within SocketProvider');
  }
  return context;
};

export const useSocket = useNotifications;
