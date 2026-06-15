import { useNavigate } from 'react-router-dom';
import { useInventoryFreezeBanner } from '../../hooks/use-inventory-freeze-banner';
import { useIsPageEnabled } from '../../hooks/use-is-page-enabled';
import { pageIdToPath } from '../../routes/app-routes';
import { AlertBanner } from '../ui/alert-banner';

export const useInventoryFreezeActive = (): boolean => {
  const inventoryCountEnabled = useIsPageEnabled('inventory-count');
  const { sessions, productionLockSessions } = useInventoryFreezeBanner(inventoryCountEnabled);
  return inventoryCountEnabled && (sessions.length > 0 || productionLockSessions.length > 0);
};

export const InventoryFreezeActionHint = () => {
  const navigate = useNavigate();
  const inventoryCountEnabled = useIsPageEnabled('inventory-count');
  const { sessions, productionLockSessions } = useInventoryFreezeBanner(inventoryCountEnabled);
  if (!inventoryCountEnabled) {
    return null;
  }
  if (sessions.length === 0 && productionLockSessions.length === 0) {
    return null;
  }
  const primary = sessions[0] ?? productionLockSessions[0];
  const isProductionOnly = sessions.length === 0 && productionLockSessions.length > 0;
  return (
    <AlertBanner tone="warning" className="mb-4">
      <span>
        {isProductionOnly
          ? `Produkcijski režim popisa je aktivan${primary.cityName ? ` u gradu ${primary.cityName}` : ''} — prijem/izdavanje i transferi su ograničeni.`
          : `Godišnji popis je aktivan${primary.cityName ? ` u gradu ${primary.cityName}` : ''} — izmjene opreme i novi transferi su privremeno onemogućeni.`}
      </span>
      <button
        type="button"
        className="ml-2 underline font-medium"
        onClick={() => navigate(pageIdToPath('inventory-count'))}
      >
        Otvori popis
      </button>
    </AlertBanner>
  );
};
