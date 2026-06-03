import { useCallback, useEffect, useState } from 'react';
import {
  fetchInventoryFreezeBannerApi,
  type InventoryFreezeBannerSessionDto,
} from '../api/inventory-api';

export const useInventoryFreezeBanner = (enabled: boolean) => {
  const [sessions, setSessions] = useState<InventoryFreezeBannerSessionDto[]>([]);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    if (!enabled) {
      setSessions([]);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchInventoryFreezeBannerApi();
      setSessions(result.activeSessions);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return { sessions, loading, refresh };
};
