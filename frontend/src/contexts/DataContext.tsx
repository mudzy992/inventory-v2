import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchAppState } from '../api/data-api';
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
  error: string | null;
  refresh: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const { user, isAuthenticated } = useAuth();
  const [state, setState] = useState<AppState>(emptyState);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const loaded = await fetchAppState(user.role);
      loaded.currentUserId = user.id;
      setState(loaded);
      syncAppState(loaded);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Greška pri učitavanju podataka';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      const cleared = emptyState();
      setState(cleared);
      syncAppState(cleared);
      return;
    }
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
