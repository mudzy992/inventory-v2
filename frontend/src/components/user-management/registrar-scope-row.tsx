import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Category, Equipment, OrgUnit, RegistrarScopeAssignment, Warehouse } from '../../types';
import { resolveEffectiveWarehouseApi } from '../../api/warehouses-api';
import { getCityLabel, getOrgUnitTypeLabel } from '../../helpers';
import {
  getAvailableCategoriesForRow,
  getAvailableOrgUnitsForRow,
  getWarehouseCategoryMode,
  isRegistrarModeA,
  type RegistrarAssignmentValidationContext,
} from '../../helpers/registrar-assignment-rules';
import { SearchableAutocomplete, type SearchableOption } from '../searchable-autocomplete';
import { OrgUnitAutocomplete } from '../org-unit-autocomplete';

interface RegistrarScopeRowProps {
  scope: RegistrarScopeAssignment;
  index: number;
  scopes: RegistrarScopeAssignment[];
  warehouses: Warehouse[];
  categories: Category[];
  orgUnits: OrgUnit[];
  equipment: Pick<Equipment, 'warehouseId' | 'categoryId'>[];
  effectiveWarehouseIdByOrgUnit?: Record<string, string | null>;
  cities: { id: string; name: string; canton?: { name: string } }[];
  onChange: (patch: Partial<RegistrarScopeAssignment>) => void;
  onRemove: () => void;
}

export const RegistrarScopeRow = ({
  scope,
  index,
  scopes,
  warehouses,
  categories,
  orgUnits,
  equipment,
  effectiveWarehouseIdByOrgUnit,
  cities,
  onChange,
  onRemove,
}: RegistrarScopeRowProps) => {
  const [orgResolveBusy, setOrgResolveBusy] = useState(false);
  const ctx: RegistrarAssignmentValidationContext = {
    categories,
    warehouses,
    orgUnits,
    equipment,
    effectiveWarehouseIdByOrgUnit,
  };
  const activeWarehouses = warehouses.filter((row) => row.isActive !== false);
  const warehouseOptions: SearchableOption[] = activeWarehouses.map((warehouse) => ({
    id: warehouse.id,
    label: warehouse.name,
    subLabel: getCityLabel(cities, warehouse.cityId),
  }));
  const availableCategories = getAvailableCategoriesForRow(scopes, index, ctx);
  const categoryOptions: SearchableOption[] = availableCategories.map((category) => ({
    id: category.id,
    label: category.name,
  }));
  const availableOrgUnits = getAvailableOrgUnitsForRow(scopes, index, ctx);
  const allowedOrgIds = new Set(availableOrgUnits.map((row) => row.id));
  const pairMode = getWarehouseCategoryMode(scopes, scope.warehouseId, scope.categoryId, index);
  const isModeA = isRegistrarModeA(scope);

  const handleOrgUnitChange = async (orgUnitId: string) => {
    if (!orgUnitId) {
      onChange({ orgUnitId: null });
      return;
    }
    setOrgResolveBusy(true);
    try {
      const result = await resolveEffectiveWarehouseApi(orgUnitId);
      onChange({
        orgUnitId,
        ...(result.warehouseId ? { warehouseId: result.warehouseId } : {}),
      });
    } catch {
      onChange({ orgUnitId });
    } finally {
      setOrgResolveBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50/80">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[10px] font-medium uppercase tracking-wide ${
            isModeA ? 'text-blue-700' : 'text-purple-700'
          }`}
        >
          Režim {isModeA ? 'A — cijelo skladište + kategorija' : 'B — služba (samo zaduženo + razduženje)'}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
          aria-label="Ukloni dodjelu"
        >
          <Trash2 size={16} />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Skladište</label>
          <SearchableAutocomplete
            options={warehouseOptions}
            value={scope.warehouseId}
            onChange={(warehouseId) => onChange({ warehouseId })}
            placeholder="Pretraži skladište…"
            ariaLabel="Skladište"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Kategorija</label>
          <SearchableAutocomplete
            options={categoryOptions}
            value={scope.categoryId}
            onChange={(categoryId) => onChange({ categoryId })}
            placeholder="Pretraži kategoriju…"
            ariaLabel="Kategorija"
            disabled={categoryOptions.length === 0}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Org. jedinica (prazno = Režim A)
        </label>
        <div className="flex gap-2 items-start">
          <div className="flex-1">
            <OrgUnitAutocomplete
              value={scope.orgUnitId ?? ''}
              onChange={(orgUnitId) => void handleOrgUnitChange(orgUnitId)}
              placeholder={orgResolveBusy ? 'Učitavanje skladišta…' : 'Pretraži službu za Režim B…'}
              allowedOrgUnitIds={pairMode === 'A' ? new Set() : allowedOrgIds}
              className={pairMode === 'A' ? 'opacity-60 pointer-events-none' : undefined}
            />
          </div>
          {!isModeA && (
            <button
              type="button"
              onClick={() => onChange({ orgUnitId: null })}
              className="shrink-0 text-xs text-gray-600 border border-gray-300 rounded-lg px-2 py-2 hover:bg-white"
            >
              Režim A
            </button>
          )}
        </div>
        {pairMode === 'A' && (
          <p className="text-[11px] text-blue-600 mt-1">
            Za ovu kategoriju u skladištu već postoji Režim A — org. suženje nije dostupno.
          </p>
        )}
        {isModeA && availableOrgUnits.length > 0 && pairMode !== 'A' && (
          <p className="text-[11px] text-gray-500 mt-1">
            Odaberite službu za Režim B ({availableOrgUnits.length} dostupno u efektivnom skladištu).
          </p>
        )}
        {scope.orgUnitId && (
          <p className="text-[11px] text-gray-500 mt-1">
            {getOrgUnitTypeLabel(orgUnits.find((row) => row.id === scope.orgUnitId)?.type ?? 'sluzba')}
          </p>
        )}
      </div>
    </div>
  );
};
