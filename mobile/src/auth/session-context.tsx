import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchMeApi, loginApi, logoutApi } from '@/api/auth';
import { setSessionExpiredHandler } from '@/api/client';
import { hydrateTokens, getAccessToken } from '@/api/tokens';
import type { AuthUser } from '@/types/models';

interface SessionValue {
  ready: boolean;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    void (async () => {
      try {
        await hydrateTokens();
        if (getAccessToken()) {
          setUser(await fetchMeApi());
        }
      } catch {
        setUser(null);
      } finally {
        setReady(true);
      }
    })();
    return () => setSessionExpiredHandler(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      user,
      login: async (username, password) => {
        setUser(await loginApi(username, password));
      },
      logout: async () => {
        await logoutApi();
        setUser(null);
      },
    }),
    [ready, user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = (): SessionValue => {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return value;
};
