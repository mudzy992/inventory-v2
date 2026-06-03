import { useSyncExternalStore, useCallback } from 'react';
import { getState, subscribe, setState } from './store';
import { useData } from './contexts/DataContext';
import type { AppState } from './types';

export function useStore(): [AppState, (updater: (prev: AppState) => AppState) => void] {
  const state = useSyncExternalStore(subscribe, getState, getState);
  const update = useCallback((updater: (prev: AppState) => AppState) => {
    setState(updater);
  }, []);
  return [state, update];
}

export function useRefreshData(): () => Promise<void> {
  const { refresh } = useData();
  return refresh;
}
