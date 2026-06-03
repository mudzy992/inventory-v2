import { useInventoryFreezeBanner } from '../../hooks/use-inventory-freeze-banner';
import type { PageId } from '../Layout';
import { AlertBanner } from '../ui/alert-banner';

interface InventoryFreezeActionHintProps {
  onOpenInventory?: (page: PageId) => void;
}

export const useInventoryFreezeActive = (): boolean => {
  const { sessions } = useInventoryFreezeBanner(true);
  return sessions.length > 0;
};

export const InventoryFreezeActionHint = ({ onOpenInventory }: InventoryFreezeActionHintProps) => {
  const { sessions } = useInventoryFreezeBanner(true);
  if (sessions.length === 0) {
    return null;
  }
  const primary = sessions[0];
  return (
    <AlertBanner tone="warning" className="mb-4">
      <span>
        Godišnji popis je aktivan{primary.cityName ? ` u gradu ${primary.cityName}` : ''} — izmjene
        opreme i novi transferi su privremeno onemogućeni.
      </span>
      {onOpenInventory ? (
        <button
          type="button"
          className="ml-2 underline font-medium"
          onClick={() => onOpenInventory('inventory-count')}
        >
          Otvori popis
        </button>
      ) : null}
    </AlertBanner>
  );
};
