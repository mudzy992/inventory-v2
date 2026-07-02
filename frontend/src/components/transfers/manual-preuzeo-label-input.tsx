import { useEffect, useId, useState } from 'react';
import {
  fetchLastManualPreuzeoLabelApi,
  fetchManualPreuzeoSuggestionsApi,
} from '../../api/transfers-api';

interface ManualPreuzeoLabelInputProps {
  value: string;
  onChange: (value: string) => void;
  equipmentId?: string;
  disabled?: boolean;
}

export const ManualPreuzeoLabelInput = ({
  value,
  onChange,
  equipmentId,
  disabled = false,
}: ManualPreuzeoLabelInputProps) => {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchManualPreuzeoSuggestionsApi()
      .then((rows) => {
        if (!cancelled) {
          setSuggestions(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSuggestions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!equipmentId) {
      return;
    }
    let cancelled = false;
    void fetchLastManualPreuzeoLabelApi(equipmentId)
      .then((label) => {
        if (!cancelled && label) {
          onChange(label);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [equipmentId, onChange]);

  return (
    <div>
      <label htmlFor="manual-preuzeo-label" className="block text-sm font-medium text-gray-700 mb-1">
        Preuzeo (za prenosnicu)
      </label>
      <input
        id="manual-preuzeo-label"
        type="text"
        list={listId}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="npr. Podružnica ED Zenica 360999"
        maxLength={255}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
      />
      <datalist id={listId}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
      <p className="text-[11px] text-gray-500 mt-1">
        Opcionalno. Ako unesete vrijednost, koristi se samo na dokumentu umjesto podrazumijevanog naziva
        skladišta ili osobe.
      </p>
    </div>
  );
};
