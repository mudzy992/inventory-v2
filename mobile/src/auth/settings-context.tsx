import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  fetchEffectiveSettingsApi,
  fetchPublicSettingsApi,
  isFlagEnabled,
  type SettingsMap,
} from '@/api/settings';
import { useSession } from './session-context';

interface SettingsValue {
  ready: boolean;
  settings: SettingsMap;
  flag: (key: string, fallback?: boolean) => boolean;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useSession();
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<SettingsMap>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const publicSettings = await fetchPublicSettingsApi();
        const next = user ? { ...publicSettings, ...(await fetchEffectiveSettingsApi()) } : publicSettings;
        if (!cancelled) {
          setSettings(next);
        }
      } catch {
        if (!cancelled) {
          setSettings({});
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const value = useMemo<SettingsValue>(
    () => ({
      ready,
      settings,
      flag: (key, fallback = true) => isFlagEnabled(settings, key, fallback),
    }),
    [ready, settings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = (): SettingsValue => {
  const value = useContext(SettingsContext);
  if (!value) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return value;
};
