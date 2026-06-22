import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchEquipmentApi, fetchEquipmentPageApi } from '../api/equipment-api';
import { getEmployeeFullName } from '../helpers';
import { getSerialNumberDisplay } from '../helpers/equipment-display.util';
import type { Category, Equipment, EquipmentStatus } from '../types';
import { cn } from '../utils/cn';

interface EquipmentAutocompleteProps {
  categories: Category[];
  status: EquipmentStatus;
  value: string;
  onChange: (equipmentId: string, equipment: Equipment | null) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  className?: string;
}

const buildEquipmentOptionLabel = (equipment: Equipment, categories: Category[]): string => {
  const category = categories.find((row) => row.id === equipment.categoryId);
  const serial = getSerialNumberDisplay(category, equipment.specifications);
  const lotName = equipment.stockLot?.productName?.trim();
  const holder = equipment.currentHolder;
  const holderLabel = holder ? getEmployeeFullName(holder) : 'Skladište';
  const parts = [equipment.inventoryNumber, lotName, serial?.value].filter(Boolean);
  return `${parts.join(' — ')} [${holderLabel}]`;
};

export const EquipmentAutocomplete = ({
  categories,
  status,
  value,
  onChange,
  placeholder = 'Pretraži po inv. broju ili serijskom (min. 2 znaka)…',
  required = false,
  disabled = false,
  id,
  ariaLabel = 'Oprema',
  className,
}: EquipmentAutocompleteProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [remoteResults, setRemoteResults] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!value) {
      setSelectedEquipment(null);
      setQuery('');
      return;
    }
    if (selectedEquipment?.id === value) {
      return;
    }
    let cancelled = false;
    void fetchEquipmentApi(value)
      .then((equipment) => {
        if (!cancelled) {
          setSelectedEquipment(equipment);
          setQuery(buildEquipmentOptionLabel(equipment, categories));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedEquipment(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [categories, value, selectedEquipment?.id]);

  useEffect(() => {
    if (!open || disabled) {
      return;
    }
    const term = query.trim();
    if (term.length < 2) {
      setRemoteResults([]);
      return;
    }
    if (selectedEquipment && query === buildEquipmentOptionLabel(selectedEquipment, categories)) {
      return;
    }
    const handle = window.setTimeout(() => {
      setLoading(true);
      void fetchEquipmentPageApi({ search: term, status, page: 1, pageSize: 20 })
        .then((response) => setRemoteResults(response.items))
        .catch(() => setRemoteResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [categories, disabled, open, query, selectedEquipment, status]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) {
      return [];
    }
    return remoteResults.slice(0, 12);
  }, [query, remoteResults]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [filtered.length, query]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const handleSelect = (equipment: Equipment) => {
    setSelectedEquipment(equipment);
    onChange(equipment.id, equipment);
    setQuery(buildEquipmentOptionLabel(equipment, categories));
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter' && filtered[highlightIndex]) {
      event.preventDefault();
      handleSelect(filtered[highlightIndex]!);
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <input
        id={id}
        type="text"
        value={query}
        required={required && !value}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setOpen(true);
          if (!next.trim()) {
            setSelectedEquipment(null);
            onChange('', null);
          } else if (
            selectedEquipment &&
            next !== buildEquipmentOptionLabel(selectedEquipment, categories)
          ) {
            setSelectedEquipment(null);
            onChange('', null);
          }
        }}
        onFocus={() => {
          if (!disabled) {
            setOpen(true);
          }
        }}
        onBlur={() => {
          if (selectedEquipment) {
            setQuery(buildEquipmentOptionLabel(selectedEquipment, categories));
          } else if (!query.trim()) {
            onChange('', null);
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none',
          disabled && 'bg-gray-50 cursor-not-allowed',
        )}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-autocomplete="list"
        role="combobox"
      />
      {open && (loading || filtered.length > 0) ? (
        <ul
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {loading ? <li className="px-3 py-2 text-xs text-gray-400">Učitavanje…</li> : null}
          {!loading &&
            filtered.map((equipment, index) => {
              const category = categories.find((row) => row.id === equipment.categoryId);
              const serial = getSerialNumberDisplay(category, equipment.specifications);
              const holder = equipment.currentHolder;
              return (
                <li key={equipment.id} role="option" aria-selected={index === highlightIndex}>
                  <button
                    type="button"
                    className={cn(
                      'w-full px-3 py-2 text-left hover:bg-gray-50',
                      index === highlightIndex && 'bg-blue-50',
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(equipment)}
                  >
                    <span className="block font-mono text-sm font-medium text-gray-800">
                      {equipment.inventoryNumber}
                    </span>
                    <span className="block text-xs text-gray-500 truncate">
                      {equipment.stockLot?.productName ?? '—'}
                      {serial ? ` · ${serial.label}: ${serial.value}` : ''}
                      {category ? ` · ${category.name}` : ''}
                    </span>
                    <span className="block text-[11px] text-gray-400 truncate">
                      {holder ? getEmployeeFullName(holder) : 'Skladište'}
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>
      ) : null}
      {open && query.trim().length >= 2 && !loading && filtered.length === 0 ? (
        <p className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 shadow-lg">
          Nema rezultata.
        </p>
      ) : null}
    </div>
  );
};
