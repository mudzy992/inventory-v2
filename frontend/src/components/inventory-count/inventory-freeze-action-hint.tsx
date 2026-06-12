import { useNavigate } from 'react-router-dom';
import { useInventoryFreezeBanner } from '../../hooks/use-inventory-freeze-banner';
import { useIsPageEnabled } from '../../hooks/use-is-page-enabled';
import { pageIdToPath } from '../../routes/app-routes';
import { AlertBanner } from '../ui/alert-banner';

export const useInventoryFreezeActive = (): boolean => {
  const inventoryCountEnabled = useIsPageEnabled('inventory-count');
  const { sessions } = useInventoryFreezeBanner(inventoryCountEnabled);
  return inventoryCountEnabled && sessions.length > 0;
};

export const InventoryFreezeActionHint = () => {
  const navigate = useNavigate();
  const inventoryCountEnabled = useIsPageEnabled('inventory-count');
  const { sessions } = useInventoryFreezeBanner(inventoryCountEnabled);
  if (!inventoryCountEnabled || sessions.length === 0) {
    return null;
  }
  const primary = sessions[0];
  return (
    <AlertBanner tone="warning" className="mb-4">
      <span>
        Godišnji popis je aktivan{primary.cityName ? ` u gradu ${primary.cityName}` : ''} — izmjene
        opreme i novi transferi su privremeno onemogućeni.
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
