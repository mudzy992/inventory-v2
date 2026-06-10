import { useCallback, useEffect, useState } from 'react';
import { fetchModuleBadgesApi, type ModuleBadges } from '../api/nav-api';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/SocketContext';

const BADGE_POLL_MS = 60_000;

export const useModuleBadges = (): ModuleBadges => {
  const { isAuthenticated } = useAuth();
  const { notifications } = useNotifications();
  const [badges, setBadges] = useState<ModuleBadges>({});

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setBadges({});
      return;
    }
    try {
      const next = await fetchModuleBadgesApi();
      setBadges(next);
    } catch {
      // keep last successful badges
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refresh();
  }, [refresh, notifications.length]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    const handle = window.setInterval(() => void refresh(), BADGE_POLL_MS);
    return () => window.clearInterval(handle);
  }, [isAuthenticated, refresh]);

  return badges;
};
