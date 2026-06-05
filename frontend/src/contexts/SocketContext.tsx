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
  fetchNotificationsPageApi,
  fetchUnreadNotificationsCountApi,
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
} from '../store';
import type { Notification } from '../types';
import { useAuth } from './AuthContext';
import { usePublicSettings } from './public-settings-context';

interface SocketContextValue {
  notifications: Notification[];
  unreadCount: number;
  hasMoreNotifications: boolean;
  isLoadingMore: boolean;
  isConnected: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  loadMoreNotifications: () => Promise<void>;
}

const SocketContext = createContext<SocketContextValue | null>(null);

const NOTIFICATIONS_PAGE_SIZE = 50;

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const { user, isAuthenticated } = useAuth();
  const { patchLocal, getBoolean } = usePublicSettings();
  const isRealtimeEnabled = getBoolean('notifications.realtime', true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMoreNotifications, setHasMoreNotifications] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [tokenRevision, setTokenRevision] = useState(0);
  const pageRef = useRef(1);
  const socketRef = useRef<Socket | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => subscribeTokenChange(() => setTokenRevision((n) => n + 1)), []);

  const syncUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const count = await fetchUnreadNotificationsCountApi();
      setUnreadCount(count);
    } catch {
      // keep badge count from last successful fetch
    }
  }, [user]);

  const refreshNotifications = useCallback(async () => {
    if (!user) {
      pageRef.current = 1;
      setNotifications([]);
      setHasMoreNotifications(false);
      setUnreadCount(0);
      applyNotificationsLoaded([]);
      return;
    }
    const response = await fetchNotificationsPageApi({
      page: 1,
      pageSize: NOTIFICATIONS_PAGE_SIZE,
    });
    pageRef.current = 1;
    setNotifications(response.items);
    setHasMoreNotifications(response.meta.page < response.meta.totalPages);
    applyNotificationsLoaded(response.items);
    await syncUnreadCount();
  }, [syncUnreadCount, user]);

  const loadMoreNotifications = useCallback(async () => {
    if (!user || isLoadingMore || !hasMoreNotifications) {
      return;
    }
    setIsLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const response = await fetchNotificationsPageApi({
        page: nextPage,
        pageSize: NOTIFICATIONS_PAGE_SIZE,
      });
      pageRef.current = nextPage;
      setNotifications((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        const merged = [...prev];
        for (const row of response.items) {
          if (!seen.has(row.id)) {
            merged.push(row);
          }
        }
        applyNotificationsLoaded(merged);
        return merged;
      });
      setHasMoreNotifications(response.meta.page < response.meta.totalPages);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMoreNotifications, isLoadingMore, user]);

  const markRead = useCallback(async (id: string) => {
    const updated = await markNotificationReadApi(id);
    setNotifications((prev) => {
      const wasUnread = prev.some((row) => row.id === id && !row.read);
      if (wasUnread && updated.read) {
        setUnreadCount((count) => Math.max(0, count - 1));
      }
      return prev.map((row) => (row.id === id ? updated : row));
    });
    applyNotificationRead(id);
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsReadApi();
    setNotifications((prev) => {
      const next = prev.map((row) => ({ ...row, read: true }));
      applyNotificationsLoaded(next);
      return next;
    });
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      destroyNotificationsSocket();
      setNotifications([]);
      setUnreadCount(0);
      setHasMoreNotifications(false);
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
          setUnreadCount(0);
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
        applyNotificationCreated(notification);
        return [notification, ...prev];
      });
      if (!notification.read) {
        setUnreadCount((prev) => prev + 1);
      }
    };
    const handleRead = (payload: { id: string }) => {
      setNotifications((prev) =>
        prev.map((row) => (row.id === payload.id ? { ...row, read: true } : row)),
      );
      applyNotificationRead(payload.id);
      setUnreadCount((prev) => Math.max(0, prev - 1));
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

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      hasMoreNotifications,
      isLoadingMore,
      isConnected,
      markRead,
      markAllRead,
      refreshNotifications,
      loadMoreNotifications,
    }),
    [
      notifications,
      unreadCount,
      hasMoreNotifications,
      isLoadingMore,
      isConnected,
      markRead,
      markAllRead,
      refreshNotifications,
      loadMoreNotifications,
    ],
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
