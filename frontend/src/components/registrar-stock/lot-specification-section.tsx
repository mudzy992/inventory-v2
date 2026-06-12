import type { ReactNode } from 'react';
import type { CategoryField, WarehouseStockLotStatus } from '../../types';
import { Button } from '../ui/button';
import { cardClass } from '../ui/form-styles';
import { CategoryFieldControl } from './category-field-control';

const LotSectionCard = ({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) => (
  <section className={`${cardClass} border-gray-200 shadow-sm overflow-hidden`}>
    <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/80">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {description ? <p className="text-xs text-gray-500 mt-1">{description}</p> : null}
    </div>
    <div className="p-5">{children}</div>
    {footer ? <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50">{footer}</div> : null}
  </section>
);

interface LotSpecificationSectionProps {
  status: WarehouseStockLotStatus;
  fields: CategoryField[];
  specs: Record<string, string>;
  onSpecsChange: (specs: Record<string, string>) => void;
  onSave: () => void;
  saving: boolean;
  isFrozen: boolean;
  hasIssuedUnits: boolean;
}

export const LotSpecificationSection = ({
  status,
  fields,
  specs,
  onSpecsChange,
  onSave,
  saving,
  isFrozen,
  hasIssuedUnits,
}: LotSpecificationSectionProps) => {
  if (fields.length === 0) {
    return null;
  }
  const isEditable = status === 'ceka_specifikaciju' || status === 'spremno_za_izdavanje';
  const isInitialSpec = status === 'ceka_specifikaciju';
  if (!isEditable && status !== 'zatvoreno') {
    return null;
  }
  if (status === 'zatvoreno') {
    return (
      <LotSectionCard
        title="Specifikacija lota"
        description="Lot je zatvoren — specifikacija je samo za pregled."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map((field) => (
            <div key={field.id}>
              <p className="text-xs font-medium text-gray-500">{field.name}</p>
              <p className="text-sm text-gray-900 mt-0.5">{specs[field.id]?.trim() || '—'}</p>
            </div>
          ))}
        </div>
      </LotSectionCard>
    );
  }
  return (
    <LotSectionCard
      title="Specifikacija lota"
      description={
        isInitialSpec
          ? 'Popunite zajedničke karakteristike za cijeli lot prije izdavanja pojedinačnih komada.'
          : 'Možete izmijeniti zajedničke karakteristike lota dok nije zatvoren.'
      }
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
            <Button disabled={saving || isFrozen} onClick={onSave}>
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
    </LotSectionCard>
  );
};
