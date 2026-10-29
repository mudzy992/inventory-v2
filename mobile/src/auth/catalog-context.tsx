import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchOrgUnitsApi, fetchWarehousesApi } from '@/api/catalog';
import type { CatalogState } from '@/types/models';
import { useSession } from './session-context';

const empty: CatalogState = { orgUnits: [], warehouses: [] };

const CatalogContext = createContext<CatalogState>(empty);

export const CatalogProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useSession();
  const [catalog, setCatalog] = useState<CatalogState>(empty);

  useEffect(() => {
    if (!user) {
      setCatalog(empty);
      return;
    }
    let cancelled = false;
    void Promise.allSettled([fetchOrgUnitsApi(), fetchWarehousesApi()]).then(([org, warehouses]) => {
      if (cancelled) {
        return;
      }
      setCatalog({
        orgUnits: org.status === 'fulfilled' ? org.value : [],
        warehouses: warehouses.status === 'fulfilled' ? warehouses.value : [],
      });
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const value = useMemo(() => catalog, [catalog]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
};

export const useCatalog = (): CatalogState => useContext(CatalogContext);
