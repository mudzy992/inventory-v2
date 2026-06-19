import type { CategoryField, Employee, EquipmentAffiliation, OrgUnit } from '../../types';
import type { AvailabilityStatus } from '../../hooks/use-equipment-availability';
import { EmployeeAutocomplete } from '../employee-autocomplete';
import { AvailabilityHint } from './availability-hint';
import { IssueUniqueFieldInput } from './issue-unique-field-input';
import { CategoryFieldControl } from './category-field-control';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { cardClass, inputClass, labelClass } from '../ui/form-styles';

export type LotUnitActionMode = 'issue' | 'commission';

interface LotUnitActionSectionProps {
  mode: LotUnitActionMode;
  categoryId: string;
  issueFields: CategoryField[];
  isAccountingTracked: boolean;
  onIsAccountingTrackedChange: (value: boolean) => void;
  inventoryNumber: string;
  onInventoryNumberChange: (value: string) => void;
  inventoryAvailability: AvailabilityStatus;
  affiliation: EquipmentAffiliation;
  onAffiliationChange: (value: EquipmentAffiliation) => void;
  unitSpecs: Record<string, string>;
  onUnitSpecsChange: (next: Record<string, string>) => void;
  onUniqueAvailabilityChange: (fieldId: string, status: AvailabilityStatus) => void;
  employeeId: string;
  onEmployeeChange: (employeeId: string, employee: Employee | null) => void;
  orgUnits: OrgUnit[];
  crossWarehouseIssueHint: string | null;
  crossWarehouseCatalogWarning?: string | null;
  canSubmit: boolean;
  saving: boolean;
  isFrozen: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export const LotUnitActionSection = ({
  mode,
  categoryId,
  issueFields,
  isAccountingTracked,
  onIsAccountingTrackedChange,
  inventoryNumber,
  onInventoryNumberChange,
  inventoryAvailability,
  affiliation,
  onAffiliationChange,
  unitSpecs,
  onUnitSpecsChange,
  onUniqueAvailabilityChange,
  employeeId,
  onEmployeeChange,
  orgUnits,
  crossWarehouseIssueHint,
  crossWarehouseCatalogWarning,
  canSubmit,
  saving,
  isFrozen,
  onSubmit,
  onCancel,
}: LotUnitActionSectionProps) => {
  const isIssue = mode === 'issue';
  const title = isIssue ? 'Izdavanje komada' : 'Kolaudacija komada';
  const description = isIssue
    ? 'Dodijelite inventurni broj i specifikaciju po komadu za jedan komad iz lota.'
    : 'Evidentirajte inventurni broj i specifikaciju po komadu — oprema ostaje na skladištu bez zaduženja.';
  const submitLabel = isIssue ? 'Potvrdi izdavanje' : 'Potvrdi kolaudaciju';

  return (
    <section className={`${cardClass} border-gray-200 shadow-sm overflow-hidden`}>
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/80">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      </div>
      <div className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">Oprema se vodi</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Isključite za opremu koja se ne vodi knjigovodstveno (bez inv. broja, bez prenosnica,
              bez popisa/rashoda).
            </p>
          </div>
          <Switch
            checked={isAccountingTracked}
            onCheckedChange={onIsAccountingTrackedChange}
            aria-label="Oprema se vodi knjigovodstveno"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isIssue ? (
            <div>
              <label className={labelClass}>Radnik *</label>
              <EmployeeAutocomplete
                orgUnits={orgUnits}
                value={employeeId}
                onChange={onEmployeeChange}
                placeholder="Pretraži radnika…"
                ariaLabel="Radnik"
                required
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Prikaz: ime · pozicija · org. putanja.
              </p>
              {crossWarehouseIssueHint ? (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Radnik pripada drugom efektivnom skladištu ({crossWarehouseIssueHint}). Oprema će
                  automatski preći na lot tog skladišta nakon izdavanja.
                </p>
              ) : null}
              {crossWarehouseCatalogWarning ? (
                <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {crossWarehouseCatalogWarning}
                </p>
              ) : null}
            </div>
          ) : null}
          {isAccountingTracked ? (
            <div>
              <label className={labelClass}>Inventurni broj *</label>
              <input
                type="text"
                value={inventoryNumber}
                onChange={(event) => onInventoryNumberChange(event.target.value)}
                className={inputClass}
              />
              <AvailabilityHint status={inventoryAvailability} />
            </div>
          ) : null}
          <div>
            <label className={labelClass}>Pripadnost *</label>
            <select
              value={affiliation}
              onChange={(event) => onAffiliationChange(event.target.value as EquipmentAffiliation)}
              className={inputClass}
              aria-label="Pripadnost"
            >
              <option value="distribucija">Distribucija</option>
              <option value="snabdjevanje">Snabdjevanje</option>
            </select>
          </div>
          {issueFields.map((field) =>
            field.unique ? (
              <IssueUniqueFieldInput
                key={field.id}
                categoryId={categoryId}
                field={field}
                value={unitSpecs[field.id] ?? ''}
                onChange={(next) => onUnitSpecsChange({ ...unitSpecs, [field.id]: next })}
                onAvailabilityChange={onUniqueAvailabilityChange}
              />
            ) : (
              <CategoryFieldControl
                key={field.id}
                field={field}
                value={unitSpecs[field.id] ?? ''}
                onChange={(next) => onUnitSpecsChange({ ...unitSpecs, [field.id]: next })}
              />
            ),
          )}
        </div>
      </div>
      <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50">
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Odustani
          </Button>
          <Button disabled={saving || isFrozen || !canSubmit} onClick={onSubmit}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </section>
  );
};
