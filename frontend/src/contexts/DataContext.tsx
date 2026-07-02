import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchBootstrap } from '../api/data-api';
import { ApiError } from '../api/client';
import { setAuthUser, syncAppState } from '../store';
import type { AppState } from '../types';
import { useAuth } from './AuthContext';

const emptyState = (): AppState => ({
  cantons: [],
  cities: [],
  warehouses: [],
  orgUnits: [],
  employees: [],
  categories: [],
  equipment: [],
  transfers: [],
  users: [],
  notifications: [],
  savedFilters: [],
  currentUserId: null,
});

interface DataContextValue {
  state: AppState;
  isLoading: boolean;
  error: { message: string; status?: number } | null;
  refresh: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const { user, isAuthenticated } = useAuth();
  const [state, setState] = useState<AppState>(emptyState);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      const cleared = emptyState();
      setState(cleared);
      syncAppState(cleared);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setAuthUser(user);
      const loaded = await fetchBootstrap(user.role);
      loaded.currentUserId = user.id;
      setState(loaded);
      syncAppState(loaded);
    } catch (err) {
      const message = err instanceof ApiError || err instanceof Error ? err.message : 'Greška pri učitavanju podataka';
      const status = err instanceof ApiError ? err.status : undefined;
      setError({ message, status });
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      const cleared = emptyState();
      setState(cleared);
      syncAppState(cleared);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    void refresh();
  }, [isAuthenticated, user, refresh]);

  const value = useMemo(
    () => ({ state, isLoading, error, refresh }),
    [state, isLoading, error, refresh],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = (): DataContextValue => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within DataProvider');
  }
  return context;
};
