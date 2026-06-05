import { useCallback, useEffect, useState } from 'react';
import {
  fetchCategoryMaintenanceLinksApi,
  fetchLinkedHostCategoriesApi,
} from '../api/maintenance-parts-api';
import { expandLinkedMaintenanceToLeaves } from '../helpers/expand-maintenance-catalog.util';
import type { Category } from '../types';
import { usePublicSettings } from '../contexts/public-settings-context';

export const useCategoryMaintenanceLinksMap = (
  categories: Category[],
  enabled: boolean,
): { labelsByHostId: Record<string, string[]>; isLoading: boolean; refresh: () => Promise<void> } => {
  const { getBoolean } = usePublicSettings();
  const maintenanceEnabled = enabled && getBoolean('features.maintenance_parts', true);
  const [labelsByHostId, setLabelsByHostId] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const refresh = useCallback(async () => {
    if (!maintenanceEnabled) {
      setLabelsByHostId({});
      return;
    }
    setIsLoading(true);
    try {
      const hosts = await fetchLinkedHostCategoriesApi();
      const entries = await Promise.all(
        hosts.map(async (host) => {
          const links = await fetchCategoryMaintenanceLinksApi(host.id);
          const linkedIds = links.map((row) => row.maintenanceCategory.id);
          const leaves = expandLinkedMaintenanceToLeaves(linkedIds, categories);
          return [host.id, leaves.map((row) => row.name)] as const;
        }),
      );
      setLabelsByHostId(Object.fromEntries(entries));
    } catch {
      setLabelsByHostId({});
    } finally {
      setIsLoading(false);
    }
  }, [categories, maintenanceEnabled]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { labelsByHostId, isLoading, refresh };
};
