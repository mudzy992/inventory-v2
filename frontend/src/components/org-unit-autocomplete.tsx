import { useEffect, useMemo, useRef, useState } from 'react';
import { searchOrgUnitsApi } from '../api/org-units-api';
import { getOrgUnitPath, getOrgUnitTypeLabel } from '../helpers';
import type { OrgUnit } from '../types';
import { cn } from '../utils/cn';

interface OrgUnitAutocompleteProps {
  orgUnits: OrgUnit[];
  value: string;
  onChange: (orgUnitId: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export const OrgUnitAutocomplete = ({
  orgUnits,
  value,
  onChange,
  placeholder = 'Pretraži org. jedinicu…',
  required = false,
  className,
}: OrgUnitAutocompleteProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = orgUnits.find((unit) => unit.id === value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [remoteResults, setRemoteResults] = useState<OrgUnit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selected) {
      setQuery(selected.name);
    } else if (!value) {
      setQuery('');
    }
  }, [selected, value]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const term = query.trim();
    if (term.length < 2) {
      setRemoteResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      setLoading(true);
      void searchOrgUnitsApi(term)
        .then(setRemoteResults)
        .catch(() => setRemoteResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [open, query]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const sorted = [...orgUnits].sort((a, b) => a.name.localeCompare(b.name));
    if (normalized.length >= 2) {
      return remoteResults;
    }
    if (!normalized) {
      return sorted.slice(0, 20);
    }
    return sorted
      .filter((unit) => {
        const path = getOrgUnitPath(orgUnits, unit.id).toLowerCase();
        return (
          unit.name.toLowerCase().includes(normalized) ||
          path.includes(normalized) ||
          getOrgUnitTypeLabel(unit.type).toLowerCase().includes(normalized)
        );
      })
      .slice(0, 20);
  }, [orgUnits, query, remoteResults]);

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

  const handleSelect = (unit: OrgUnit) => {
    onChange(unit.id);
    setQuery(unit.name);
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
        type="text"
        value={query}
        required={required && !value}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (!event.target.value.trim()) {
            onChange('');
          }
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        aria-label="Organizacijska jedinica"
        aria-expanded={open}
        aria-autocomplete="list"
        role="combobox"
      />
      {open && (loading || filtered.length > 0) ? (
        <ul
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {loading ? (
            <li className="px-3 py-2 text-xs text-gray-400">Učitavanje…</li>
          ) : null}
          {!loading &&
            filtered.map((unit, index) => {
              const parentPath = (() => {
                const full = getOrgUnitPath(orgUnits, unit.id);
                if (full === unit.name) {
                  return getOrgUnitTypeLabel(unit.type);
                }
                const prefix = `${unit.name} → `;
                return full.startsWith(prefix) ? full.slice(prefix.length) : full;
              })();
              return (
                <li key={unit.id} role="option" aria-selected={index === highlightIndex}>
                  <button
                    type="button"
                    className={cn(
                      'w-full px-3 py-2 text-left hover:bg-gray-50',
                      index === highlightIndex && 'bg-blue-50',
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(unit)}
                  >
                    <span className="block text-sm font-medium text-gray-800">{unit.name}</span>
                    <span className="block text-xs text-gray-500 truncate">{parentPath}</span>
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
