import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchPrivateSettingsApi, type SettingDto } from '../api/settings-api';
import { isAdmin } from '../store';
import { useAuth } from './AuthContext';

interface AdminSettingsContextValue {
  settings: Record<string, string | number | boolean>;
  isLoading: boolean;
  refresh: () => Promise<void>;
  getBoolean: (key: string, fallback?: boolean) => boolean;
  getNumber: (key: string, fallback: number) => number;
}

const AdminSettingsContext = createContext<AdminSettingsContextValue | null>(null);

export const AdminSettingsProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = useAuth();
  const [settings, setSettings] = useState<Record<string, string | number | boolean>>({});
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !isAdmin()) {
      setSettings({});
      return;
    }
    setIsLoading(true);
    try {
      const rows = await fetchPrivateSettingsApi();
      const map: Record<string, string | number | boolean> = {};
      for (const row of rows) {
        map[row.key] = row.value;
      }
      setSettings(map);
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

  return (
    <AdminSettingsContext.Provider value={value}>{children}</AdminSettingsContext.Provider>
  );
};

export const useAdminSettings = (): AdminSettingsContextValue => {
  const context = useContext(AdminSettingsContext);
  if (!context) {
    throw new Error('useAdminSettings must be used within AdminSettingsProvider');
  }
  return context;
};
