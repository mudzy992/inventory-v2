import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchEmployeeApi, searchEmployeesApi } from '../api/employees-api';
import { getEmployeeFullName, getOrgUnitPath } from '../helpers';
import type { Employee, OrgUnit } from '../types';
import { cn } from '../utils/cn';

interface EmployeeAutocompleteProps {
  orgUnits: OrgUnit[];
  value: string;
  onChange: (employeeId: string, employee: Employee | null) => void;
  excludeIds?: ReadonlySet<string>;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  className?: string;
}

export const EmployeeAutocomplete = ({
  orgUnits,
  value,
  onChange,
  excludeIds,
  placeholder = 'Pretraži radnika (min. 2 znaka)…',
  required = false,
  disabled = false,
  id,
  ariaLabel = 'Radnik',
  className,
}: EmployeeAutocompleteProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [remoteResults, setRemoteResults] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!value) {
      setSelectedEmployee(null);
      setQuery('');
      return;
    }
    if (selectedEmployee?.id === value) {
      return;
    }
    let cancelled = false;
    void fetchEmployeeApi(value)
      .then((employee) => {
        if (!cancelled) {
          setSelectedEmployee(employee);
          setQuery(getEmployeeFullName(employee));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedEmployee(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [value, selectedEmployee?.id]);

  useEffect(() => {
    if (!open || disabled) {
      return;
    }
    const term = query.trim();
    if (term.length < 2) {
      setRemoteResults([]);
      return;
    }
    if (selectedEmployee && query === getEmployeeFullName(selectedEmployee)) {
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
  }, [disabled, open, query, selectedEmployee]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const available = remoteResults.filter((employee) => !excludeIds?.has(employee.id));
    if (normalized.length < 2) {
      return [];
    }
    return available.slice(0, 12);
  }, [excludeIds, query, remoteResults]);

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

  const handleSelect = (employee: Employee) => {
    if (excludeIds?.has(employee.id)) {
      return;
    }
    setSelectedEmployee(employee);
    onChange(employee.id, employee);
    setQuery(getEmployeeFullName(employee));
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
            setSelectedEmployee(null);
            onChange('', null);
          } else if (selectedEmployee && next !== getEmployeeFullName(selectedEmployee)) {
            setSelectedEmployee(null);
            onChange('', null);
          }
        }}
        onFocus={() => {
          if (!disabled) {
            setOpen(true);
          }
        }}
        onBlur={() => {
          if (selectedEmployee) {
            setQuery(getEmployeeFullName(selectedEmployee));
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
                    onClick={() => handleSelect(employee)}
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
