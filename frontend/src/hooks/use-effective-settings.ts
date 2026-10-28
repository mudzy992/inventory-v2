import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchEffectiveSettingsApi } from '../api/settings-api';
import { useAuth } from '../contexts/AuthContext';

export interface EffectiveSettingsValue {
  settings: Record<string, string | number | boolean>;
  isLoading: boolean;
  refresh: () => Promise<void>;
  getBoolean: (key: string, fallback?: boolean) => boolean;
  getNumber: (key: string, fallback: number) => number;
}

export const useEffectiveSettings = (): EffectiveSettingsValue => {
  const { isAuthenticated } = useAuth();
  const [settings, setSettings] = useState<Record<string, string | number | boolean>>({});
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setSettings({});
      return;
    }
    setIsLoading(true);
    try {
      const data = await fetchEffectiveSettingsApi();
      setSettings(data);
    } catch {
      setSettings({});
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const getBoolean = useCallback(
    (key: string, fallback = false): boolean => {
      const value = settings[key];
      if (typeof value === 'boolean') {
        return value;
      }
      if (value === 'true') {
        return true;
      }
      if (value === 'false') {
        return false;
      }
      return fallback;
    },
    [settings],
  );

  const getNumber = useCallback(
    (key: string, fallback: number): number => {
      const value = settings[key];
      if (typeof value === 'number' && !Number.isNaN(value)) {
        return value;
      }
      return fallback;
    },
    [settings],
  );

  const value = useMemo(
    () => ({ settings, isLoading, refresh, getBoolean, getNumber }),
    [settings, isLoading, refresh, getBoolean, getNumber],
  );

  return value;
};
