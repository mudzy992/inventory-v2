import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { cn } from '../utils/cn';
import { useNotifications } from '../contexts/SocketContext';
import { usePublicSettings } from '../contexts/public-settings-context';
import { getNotificationTypeMeta } from '../helpers/notification-type.util';
import { pageIdToPath } from '../routes/app-routes';
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
  const navigate = useNavigate();
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

  const handleNotificationClick = (notification: Notification) => {
    handleMarkRead(notification);
    if (
      notification.type === 'employee_relocation_admin_alert' ||
      notification.type === 'employee_relocation_action_required' ||
      notification.type === 'employee_relocation_incoming'
    ) {
      navigate(pageIdToPath('employee-relocation'));
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifikacije"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Bell size={20} className="text-gray-600" />
        {unreadCount > 0 ? (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-4 text-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-[min(100vw-2rem,24rem)] bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Notifikacije</h2>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <CheckCheck size={14} />
                  Označi sve
                </button>
              ) : null}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-500 text-center">Nema notifikacija</p>
              ) : (
                <ul>
                  {notifications.map((notification) => {
                    const meta = getNotificationTypeMeta(notification.type);
                    return (
                      <li key={notification.id}>
                        <button
                          type="button"
                          onClick={() => handleNotificationClick(notification)}
                          className={cn(
                            'w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors',
                            !notification.read && 'bg-blue-50/50',
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', meta.badgeClass)}>
                              {meta.label}
                            </span>
                            <span className="text-[10px] text-gray-400 ml-auto shrink-0">
                              {formatRelativeTime(notification.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-800 mt-1">{notification.title}</p>
                          {notification.body ? (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.body}</p>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {hasMoreNotifications ? (
              <div className="p-2 border-t border-gray-100">
                <button
                  type="button"
                  disabled={isLoadingMore}
                  onClick={() => void loadMoreNotifications()}
                  className="w-full text-sm text-blue-600 hover:text-blue-800 py-2 disabled:opacity-50"
                >
                  {isLoadingMore ? 'Učitavanje…' : 'Učitaj više'}
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
};
