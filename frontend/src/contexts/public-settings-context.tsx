import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchPublicSettingsApi, publicSettingsToMap } from '../api/public-settings-api';

interface PublicSettingsContextValue {
  settings: Record<string, string | number | boolean>;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const PublicSettingsContext = createContext<PublicSettingsContextValue | null>(null);

export const PublicSettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<Record<string, string | number | boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await fetchPublicSettingsApi();
      setSettings(publicSettingsToMap(rows));
    } catch {
      setSettings({});
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ settings, isLoading, refresh }),
    [settings, isLoading, refresh],
  );

  return (
    <PublicSettingsContext.Provider value={value}>{children}</PublicSettingsContext.Provider>
  );
};

export const usePublicSettings = (): PublicSettingsContextValue => {
  const context = useContext(PublicSettingsContext);
  if (!context) {
    throw new Error('usePublicSettings must be used within PublicSettingsProvider');
  }
  return context;
};
