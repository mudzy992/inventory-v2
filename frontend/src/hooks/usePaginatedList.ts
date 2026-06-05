import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PaginatedListParams, PaginatedResponse } from '../types/pagination';

const DEFAULT_DEBOUNCE_MS = 300;

export interface UsePaginatedListOptions<T, F extends Record<string, string | undefined>> {
  fetchPage: (params: PaginatedListParams & F) => Promise<PaginatedResponse<T>>;
  initialFilters?: F;
  initialPageSize?: number;
  initialSortBy?: string;
  initialSortDir?: 'asc' | 'desc';
  debounceMs?: number;
  enabled?: boolean;
}

export interface UsePaginatedListResult<T, F extends Record<string, string | undefined>> {
  items: T[];
  meta: PaginatedResponse<T>['meta'] | null;
  page: number;
  pageSize: number;
  sortBy: string | undefined;
  sortDir: 'asc' | 'desc';
  search: string;
  filters: F;
  isLoading: boolean;
  error: string | null;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setSearch: (value: string) => void;
  setSort: (sortBy: string, sortDir?: 'asc' | 'desc') => void;
  setFilters: (updater: F | ((prev: F) => F)) => void;
  refresh: () => Promise<void>;
}

export function usePaginatedList<T, F extends Record<string, string | undefined> = Record<string, never>>(
  options: UsePaginatedListOptions<T, F>,
): UsePaginatedListResult<T, F> {
  const {
    fetchPage,
    initialFilters = {} as F,
    initialPageSize = 25,
    initialSortBy,
    initialSortDir = 'asc',
    debounceMs = DEFAULT_DEBOUNCE_MS,
    enabled = true,
  } = options;

  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState<PaginatedResponse<T>['meta'] | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [sortBy, setSortBy] = useState<string | undefined>(initialSortBy);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSortDir);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFiltersState] = useState<F>(initialFilters);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search), debounceMs);
    return () => window.clearTimeout(handle);
  }, [search, debounceMs]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters, pageSize, sortBy, sortDir]);

  const load = useCallback(async () => {
    if (!enabled) {
      return;
    }
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchPage({
        page,
        pageSize,
        sortBy,
        sortDir,
        search: debouncedSearch || undefined,
        ...filters,
      });
      if (currentRequest !== requestId.current) {
        return;
      }
      setItems(response.items);
      setMeta(response.meta);
    } catch (err) {
      if (currentRequest !== requestId.current) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Greška pri učitavanju');
      setItems([]);
      setMeta(null);
    } finally {
      if (currentRequest === requestId.current) {
        setIsLoading(false);
      }
    }
  }, [debouncedSearch, enabled, fetchPage, filters, page, pageSize, sortBy, sortDir]);

  useEffect(() => {
    void load();
  }, [load]);

  const setFilters = useCallback((updater: F | ((prev: F) => F)) => {
    setFiltersState((prev) => (typeof updater === 'function' ? updater(prev) : updater));
  }, []);

  const setSort = useCallback((nextSortBy: string, nextSortDir: 'asc' | 'desc' = 'asc') => {
    setSortBy(nextSortBy);
    setSortDir(nextSortDir);
  }, []);

  return useMemo(
    () => ({
      items,
      meta,
      page,
      pageSize,
      sortBy,
      sortDir,
      search,
      filters,
      isLoading,
      error,
      setPage,
      setPageSize,
      setSearch,
      setSort,
      setFilters,
      refresh: load,
    }),
    [
      items,
      meta,
      page,
      pageSize,
      sortBy,
      sortDir,
      search,
      filters,
      isLoading,
      error,
      setFilters,
      setSort,
      load,
    ],
  );
}
