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
import { mergePublicSettingsWithFeatureDefaults } from '../constants/public-feature-defaults';

interface PublicSettingsContextValue {
  settings: Record<string, string | number | boolean>;
  isLoading: boolean;
  refresh: () => Promise<void>;
  getBoolean: (key: string, fallback?: boolean) => boolean;
  getString: (key: string, fallback?: string) => string;
  patchLocal: (key: string, value: string | number | boolean) => void;
}

const PublicSettingsContext = createContext<PublicSettingsContextValue | null>(null);

export const PublicSettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<Record<string, string | number | boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await fetchPublicSettingsApi();
      setSettings(mergePublicSettingsWithFeatureDefaults(publicSettingsToMap(rows)));
    } catch {
      setSettings({});
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getBoolean = useCallback(
    (key: string, fallback = false): boolean => {
      const value = settings[key];
      return typeof value === 'boolean' ? value : fallback;
    },
    [settings],
  );

  const getString = useCallback(
    (key: string, fallback = ''): string => {
      const value = settings[key];
      return typeof value === 'string' ? value : fallback;
    },
    [settings],
  );

  const patchLocal = useCallback((key: string, value: string | number | boolean) => {
    setSettings((prev) => mergePublicSettingsWithFeatureDefaults({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ settings, isLoading, refresh, getBoolean, getString, patchLocal }),
    [settings, isLoading, refresh, getBoolean, getString, patchLocal],
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
