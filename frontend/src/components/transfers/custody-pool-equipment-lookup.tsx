import { useState } from 'react';
import { Search } from 'lucide-react';
import {
  CUSTODY_POOL_LOOKUP_NOT_FOUND_MESSAGE,
  resolveCustodyPoolEquipmentApi,
  type CustodyPoolEquipment,
} from '../../api/equipment-api';
import { getEmployeeFullName, getOrgUnitPath } from '../../helpers';
import { getSerialNumberDisplay } from '../../helpers/equipment-display.util';
import { getApiErrorMessage } from '../../helpers/run-mutation-with-refresh.util';
import type { AppState, Equipment } from '../../types';

interface CustodyPoolEquipmentLookupProps {
  state: AppState;
  value: string;
  onChange: (equipmentId: string, equipment: Equipment | null) => void;
  disabled?: boolean;
}

export const CustodyPoolEquipmentLookup = ({
  state,
  value,
  onChange,
  disabled = false,
}: CustodyPoolEquipmentLookupProps) => {
  const [inventoryNumber, setInventoryNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<CustodyPoolEquipment | null>(null);

  const handleSearch = async () => {
    const term = inventoryNumber.trim();
    if (!term) {
      setError('Unesite inventurni broj.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const equipment = await resolveCustodyPoolEquipmentApi(term);
      setResolved(equipment);
      onChange(equipment.id, equipment);
    } catch (err) {
      setResolved(null);
      onChange('', null);
      const message = getApiErrorMessage(err, CUSTODY_POOL_LOOKUP_NOT_FOUND_MESSAGE);
      setError(message || CUSTODY_POOL_LOOKUP_NOT_FOUND_MESSAGE);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setInventoryNumber('');
    setResolved(null);
    setError(null);
    onChange('', null);
  };

  const category = resolved
    ? state.categories.find((row) => row.id === resolved.categoryId)
    : undefined;
  const serial = resolved && category
    ? getSerialNumberDisplay(category, resolved.specifications)
    : null;
  const lastHolder = resolved?.lastRazduzenjeFromPerson;

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Pretraga poola vraćene opreme po tačnom inventurnom broju (Režim B).
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={inventoryNumber}
          onChange={(event) => setInventoryNumber(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleSearch();
            }
          }}
          disabled={disabled || loading}
          placeholder="Inventurni broj…"
          aria-label="Inventurni broj poola vraćene opreme"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <button
          type="button"
          onClick={() => void handleSearch()}
          disabled={disabled || loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <Search size={16} />
          {loading ? 'Tražim…' : 'Traži'}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {resolved && value === resolved.id ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm space-y-1">
          <p className="font-mono font-semibold text-green-900">{resolved.inventoryNumber}</p>
          <p className="text-green-800">{category?.name ?? 'Kategorija'}</p>
          {serial?.value ? <p className="text-green-700">Serijski: {serial.value}</p> : null}
          {resolved.warehouse?.name ? (
            <p className="text-green-700">Skladište: {resolved.warehouse.name}</p>
          ) : null}
          {lastHolder ? (
            <p className="text-green-700">
              Zadnje razduženo sa: {getEmployeeFullName(lastHolder)}
              <span className="block text-xs text-green-600">
                {getOrgUnitPath(state.orgUnits, lastHolder.orgUnitId)}
              </span>
            </p>
          ) : null}
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-green-800 underline mt-1"
          >
            Poništi odabir
          </button>
        </div>
      ) : null}
    </div>
  );
};
