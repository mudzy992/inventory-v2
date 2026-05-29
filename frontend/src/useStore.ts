import { useSyncExternalStore, useCallback } from 'react';
import { getState, subscribe, setState } from './store';
import type { AppState } from './types';

export function useStore(): [AppState, (updater: (prev: AppState) => AppState) => void] {
  const state = useSyncExternalStore(subscribe, getState, getState);
  const update = useCallback((updater: (prev: AppState) => AppState) => {
    setState(updater);
  }, []);
  return [state, update];
}
