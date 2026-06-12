import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { CategoryField, WarehouseStockLotStatus } from '../../types';
import { Button } from '../ui/button';
import { cardClass } from '../ui/form-styles';
import { CategoryFieldControl } from './category-field-control';

interface CollapsibleLotSectionCardProps {
  title: string;
  description?: string;
  collapsedHint?: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

const CollapsibleLotSectionCard = ({
  title,
  description,
  collapsedHint,
  isExpanded,
  onToggle,
  children,
  footer,
}: CollapsibleLotSectionCardProps) => (
  <section className={`${cardClass} border-gray-200 shadow-sm overflow-hidden`}>
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isExpanded}
      className="w-full px-5 py-4 border-b border-gray-100 bg-gray-50/80 text-left hover:bg-gray-100/80 transition-colors"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-gray-400 shrink-0" aria-hidden>
          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {isExpanded && description ? (
            <p className="text-xs text-gray-500 mt-1">{description}</p>
          ) : null}
          {!isExpanded && collapsedHint ? (
            <p className="text-xs text-gray-500 mt-1">{collapsedHint}</p>
          ) : null}
        </div>
      </div>
    </button>
    {isExpanded ? (
      <>
        <div className="p-5">{children}</div>
        {footer ? <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50">{footer}</div> : null}
      </>
    ) : null}
  </section>
);

interface LotSpecificationSectionProps {
  lotId: string;
  status: WarehouseStockLotStatus;
  fields: CategoryField[];
  specs: Record<string, string>;
  onSpecsChange: (specs: Record<string, string>) => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
  isFrozen: boolean;
  hasIssuedUnits: boolean;
}

const isExpandedByDefault = (status: WarehouseStockLotStatus): boolean =>
  status === 'ceka_specifikaciju';

export const LotSpecificationSection = ({
  lotId,
  status,
  fields,
  specs,
  onSpecsChange,
  onSave,
  saving,
  isFrozen,
  hasIssuedUnits,
}: LotSpecificationSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(() => isExpandedByDefault(status));

  useEffect(() => {
    setIsExpanded(isExpandedByDefault(status));
  }, [lotId]);

  if (fields.length === 0) {
    return null;
  }
  const isEditable = status === 'ceka_specifikaciju' || status === 'spremno_za_izdavanje';
  const isInitialSpec = status === 'ceka_specifikaciju';
  if (!isEditable && status !== 'zatvoreno') {
    return null;
  }

  const handleToggle = () => {
    setIsExpanded((prev) => !prev);
  };

  const handleSave = async () => {
    await onSave();
    setIsExpanded(false);
  };

  if (status === 'zatvoreno') {
    return (
      <CollapsibleLotSectionCard
        title="Specifikacija lota"
        description="Lot je zatvoren — specifikacija je samo za pregled."
        collapsedHint="Kliknite za pregled specifikacije."
        isExpanded={isExpanded}
        onToggle={handleToggle}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map((field) => (
            <div key={field.id}>
              <p className="text-xs font-medium text-gray-500">{field.name}</p>
              <p className="text-sm text-gray-900 mt-0.5">{specs[field.id]?.trim() || '—'}</p>
            </div>
          ))}
        </div>
      </CollapsibleLotSectionCard>
    );
  }

  const filledCount = fields.filter((field) => specs[field.id]?.trim()).length;

  return (
    <CollapsibleLotSectionCard
      title="Specifikacija lota"
      description={
        isInitialSpec
          ? 'Popunite zajedničke karakteristike za cijeli lot prije izdavanja pojedinačnih komada.'
          : 'Možete izmijeniti zajedničke karakteristike lota dok nije zatvoren.'
      }
      collapsedHint={
        isInitialSpec
          ? 'Obavezno popunite specifikaciju prije izdavanja.'
          : `Definisano (${filledCount}/${fields.length} polja). Kliknite za pregled ili izmjenu.`
      }
      isExpanded={isExpanded}
      onToggle={handleToggle}
      footer={
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {hasIssuedUnits ? (
            <p className="text-xs text-amber-800">
              Izmjena ne utiče na već izdatu opremu — podaci su snimljeni pri izdavanju.
            </p>
          ) : (
            <span />
          )}
          <div className="flex justify-end">
            <Button disabled={saving || isFrozen} onClick={() => void handleSave()}>
              {isInitialSpec ? 'Sačuvaj specifikaciju' : 'Sačuvaj izmjene'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map((field) => (
          <CategoryFieldControl
            key={field.id}
            field={field}
            value={specs[field.id] ?? ''}
            onChange={(next) => onSpecsChange({ ...specs, [field.id]: next })}
          />
        ))}
      </div>
    </CollapsibleLotSectionCard>
  );
};
