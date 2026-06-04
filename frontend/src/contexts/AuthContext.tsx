import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, ensureAccessTokenFresh } from '../api/client';
import { fetchMeApi, loginApi, logoutApi, type AuthUserDto } from '../api/auth-api';
import {
  AUTH_SESSION_EXPIRED_EVENT,
  clearTokens,
  getAccessToken,
  getRefreshToken,
} from '../api/token-storage';
import { setAuthUser } from '../store';

interface AuthContextValue {
  user: AuthUserDto | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const loadProfileWithRefresh = async (): Promise<AuthUserDto> => {
  try {
    return await fetchMeApi();
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401 || !getRefreshToken()) {
      throw err;
    }
    await ensureAccessTokenFresh();
    return fetchMeApi();
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null);
      setAuthUser(null);
    };
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      if (!getAccessToken() && !getRefreshToken()) {
        setIsLoading(false);
        return;
      }
      try {
        const profile = await loadProfileWithRefresh();
        setUser(profile);
        setAuthUser(profile);
      } catch {
        clearTokens();
        setAuthUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    void bootstrap();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const profile = await loginApi(username, password);
    setUser(profile);
    setAuthUser(profile);
  }, []);

  const logout = useCallback(async () => {
    await logoutApi();
    setUser(null);
    setAuthUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      login,
      logout,
    }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
