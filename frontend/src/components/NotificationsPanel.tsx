import { useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { cn } from '../utils/cn';
import { useNotifications } from '../contexts/SocketContext';
import { usePublicSettings } from '../contexts/public-settings-context';
import { getNotificationTypeMeta } from '../helpers/notification-type.util';
import type { Notification } from '../types';

const formatRelativeTime = (iso: string): string => {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return 'Upravo sada';
  }
  if (minutes < 60) {
    return `Prije ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Prije ${hours} h`;
  }
  return date.toLocaleDateString('bs-BA');
};

export const NotificationsPanel = () => {
  const {
    notifications,
    unreadCount,
    hasMoreNotifications,
    isLoadingMore,
    markRead,
    markAllRead,
    loadMoreNotifications,
  } = useNotifications();
  const { getBoolean } = usePublicSettings();
  const [open, setOpen] = useState(false);
  const notificationsEnabled = getBoolean('notifications.enabled', true);

  if (!notificationsEnabled) {
    return null;
  }

  const handleMarkRead = (notification: Notification) => {
    if (!notification.read) {
      void markRead(notification.id);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifikacije"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="font-medium text-gray-800">Notifikacije</p>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  <CheckCheck size={14} />
                  Označi sve
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-sm text-center text-gray-400">Nema notifikacija</p>
              ) : (
                notifications.map((notification) => {
                  const typeMeta = getNotificationTypeMeta(notification.type);
                  const TypeIcon = typeMeta.icon;
                  return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => handleMarkRead(notification)}
                    className={cn(
                      'w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors',
                      !notification.read && 'bg-blue-50/50',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <TypeIcon size={16} className="text-gray-400 mt-0.5 flex-shrink-0" aria-hidden />
                        <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{notification.title}</p>
                      <p className="text-[10px] text-gray-400">{typeMeta.label}</p>
                        </div>
                      </div>
                      {!notification.read && (
                        <span className="mt-1 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{notification.message}</p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {formatRelativeTime(notification.createdAt)}
                    </p>
                  </button>
                  );
                })
              )}
            </div>
            {hasMoreNotifications ? (
              <div className="border-t border-gray-100 px-4 py-2">
                <button
                  type="button"
                  disabled={isLoadingMore}
                  onClick={() => void loadMoreNotifications()}
                  className="w-full text-xs text-blue-600 hover:text-blue-700 disabled:text-gray-400 py-1"
                >
                  {isLoadingMore ? 'Učitavanje…' : 'Učitaj više'}
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
};
