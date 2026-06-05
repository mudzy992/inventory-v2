import { AlertTriangle } from 'lucide-react';
import type { InventoryFreezeBannerSessionDto } from '../../api/inventory-api';
import type { PageId } from '../Layout';
import { useIsPageEnabled } from '../../hooks/use-is-page-enabled';

interface InventoryFreezeBannerProps {
  sessions: InventoryFreezeBannerSessionDto[];
  onNavigate: (page: PageId) => void;
}

export const InventoryFreezeBanner = ({ sessions, onNavigate }: InventoryFreezeBannerProps) => {
  const inventoryCountEnabled = useIsPageEnabled('inventory-count');
  if (sessions.length === 0 || !inventoryCountEnabled) {
    return null;
  }
  const primary = sessions[0];
  const extraCount = sessions.length - 1;
  return (
    <div
      className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" aria-hidden />
        <p className="text-sm text-amber-900">
          Godišnji popis je aktivan
          {primary.cityName ? ` u gradu ${primary.cityName}` : ''}:{' '}
          <strong>{primary.name}</strong>
          {primary.orgUnitName ? ` (${primary.orgUnitName})` : ''}
          {extraCount > 0 ? ` · +${extraCount} drugih sesija` : ''}
          . Promjene opreme i prenosnica su ograničene.
        </p>
      </div>
      <button
        type="button"
        onClick={() => onNavigate('inventory-count')}
        className="shrink-0 text-sm font-medium text-amber-900 underline hover:text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-400 rounded px-1"
      >
        Otvori popis
      </button>
    </div>
  );
};
