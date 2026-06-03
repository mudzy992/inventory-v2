import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchMeApi, loginApi, logoutApi, type AuthUserDto } from '../api/auth-api';
import { setAuthUser } from '../store';

interface AuthContextValue {
  user: AuthUserDto | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      const token = sessionStorage.getItem('accessToken');
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const profile = await fetchMeApi();
        setUser(profile);
        setAuthUser(profile);
      } catch {
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('refreshToken');
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
