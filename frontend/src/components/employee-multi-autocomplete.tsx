import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { searchEmployeesApi } from '../api/employees-api';
import { getEmployeeFullName, getOrgUnitPath } from '../helpers';
import type { Employee, OrgUnit } from '../types';
import { cn } from '../utils/cn';

interface EmployeeMultiAutocompleteProps {
  orgUnits: OrgUnit[];
  value: string[];
  onChange: (ids: string[]) => void;
  excludeIds?: ReadonlySet<string>;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

export const EmployeeMultiAutocomplete = ({
  orgUnits,
  value,
  onChange,
  excludeIds,
  placeholder = 'Pretraži i dodaj člana…',
  ariaLabel = 'Članovi',
  className,
}: EmployeeMultiAutocompleteProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [selectedEmployees, setSelectedEmployees] = useState<Employee[]>([]);
  const [remoteResults, setRemoteResults] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSelectedEmployees((prev) => {
      const byId = new Map(prev.map((employee) => [employee.id, employee]));
      return value
        .map((id) => byId.get(id))
        .filter(Boolean) as Employee[];
    });
  }, [value]);

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
      void searchEmployeesApi(term)
        .then(setRemoteResults)
        .catch(() => setRemoteResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [open, query]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const available = remoteResults.filter(
      (employee) => !value.includes(employee.id) && !excludeIds?.has(employee.id),
    );
    if (normalized.length < 2) {
      return [];
    }
    return available.slice(0, 12);
  }, [excludeIds, query, remoteResults, value]);

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

  const handleAdd = (employee: Employee) => {
    if (value.includes(employee.id) || excludeIds?.has(employee.id)) {
      return;
    }
    setSelectedEmployees((prev) => [...prev.filter((row) => row.id !== employee.id), employee]);
    onChange([...value, employee.id]);
    setQuery('');
    setOpen(false);
  };

  const handleRemove = (employeeId: string) => {
    setSelectedEmployees((prev) => prev.filter((employee) => employee.id !== employeeId));
    onChange(value.filter((id) => id !== employeeId));
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
      handleAdd(filtered[highlightIndex]!);
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {selectedEmployees.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedEmployees.map((employee) => (
            <span
              key={employee.id}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-800 px-2.5 py-1 text-xs"
            >
              {getEmployeeFullName(employee)}
              <button
                type="button"
                onClick={() => handleRemove(employee.id)}
                className="text-blue-600 hover:text-blue-800"
                aria-label={`Ukloni ${getEmployeeFullName(employee)}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
          {loading ? (
            <li className="px-3 py-2 text-xs text-gray-400">Učitavanje…</li>
          ) : null}
          {!loading &&
            filtered.map((employee, index) => {
              const orgUnit = orgUnits.find((unit) => unit.id === employee.orgUnitId);
              const orgPath = orgUnit ? getOrgUnitPath(orgUnits, orgUnit.id) : '—';
              return (
                <li key={employee.id} role="option" aria-selected={index === highlightIndex}>
                  <button
                    type="button"
                    className={cn(
                      'w-full px-3 py-2 text-left hover:bg-gray-50',
                      index === highlightIndex && 'bg-blue-50',
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleAdd(employee)}
                  >
                    <span className="block text-sm font-medium text-gray-800">
                      {getEmployeeFullName(employee)}
                    </span>
                    <span className="block text-xs text-gray-500 truncate">
                      {employee.title || '—'} · {orgPath}
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
