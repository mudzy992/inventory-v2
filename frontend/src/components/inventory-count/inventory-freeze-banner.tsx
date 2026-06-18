import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import type { InventoryFreezeBannerSessionDto } from '../../api/inventory-api';
import { pageIdToPath } from '../../routes/app-routes';
import { useIsPageEnabled } from '../../hooks/use-is-page-enabled';

interface InventoryFreezeBannerProps {
  sessions: InventoryFreezeBannerSessionDto[];
  productionLockSessions?: InventoryFreezeBannerSessionDto[];
}

export const InventoryFreezeBanner = ({
  sessions,
  productionLockSessions = [],
}: InventoryFreezeBannerProps) => {
  const navigate = useNavigate();
  const inventoryCountEnabled = useIsPageEnabled('inventory-count');
  if ((sessions.length === 0 && productionLockSessions.length === 0) || !inventoryCountEnabled) {
    return null;
  }
  const primary = sessions[0] ?? productionLockSessions[0];
  const extraCount = sessions.length + productionLockSessions.length - 1;
  const isProductionOnly = sessions.length === 0;
  return (
    <div
      className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" aria-hidden />
        <p className="text-sm text-amber-900">
          {isProductionOnly ? 'Produkcijski režim popisa' : 'Godišnji popis je aktivan'}
          {primary.warehouseName
            ? ` za skladište ${primary.warehouseName}`
            : primary.cityName
              ? ` u gradu ${primary.cityName}`
              : ''}
          : <strong>{primary.name}</strong>
          {primary.orgUnitName ? ` (${primary.orgUnitName})` : ''}
          {extraCount > 0 ? ` · +${extraCount} drugih sesija` : ''}
          . {isProductionOnly ? 'Skladišne operacije su ograničene.' : 'Promjene opreme i prenosnica su ograničene.'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => navigate(pageIdToPath('inventory-count'))}
        className="shrink-0 text-sm font-medium text-amber-900 underline hover:text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-400 rounded px-1"
      >
        Otvori popis
      </button>
    </div>
  );
};
