import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { getEmployeeFullName, getOrgUnitPath } from '../helpers';
import type { Employee, OrgUnit } from '../types';
import { cn } from '../utils/cn';

interface EmployeeMultiAutocompleteProps {
  employees: Employee[];
  orgUnits: OrgUnit[];
  value: string[];
  onChange: (ids: string[]) => void;
  excludeIds?: ReadonlySet<string>;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

export const EmployeeMultiAutocomplete = ({
  employees,
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

  const selectedEmployees = useMemo(
    () => value.map((id) => employees.find((employee) => employee.id === id)).filter(Boolean) as Employee[],
    [employees, value],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const available = employees.filter(
      (employee) => !value.includes(employee.id) && !excludeIds?.has(employee.id),
    );
    const sorted = [...available].sort((a, b) =>
      getEmployeeFullName(a).localeCompare(getEmployeeFullName(b)),
    );
    if (!normalized) {
      return sorted.slice(0, 12);
    }
    return sorted
      .filter((employee) => {
        const orgUnit = orgUnits.find((unit) => unit.id === employee.orgUnitId);
        const orgPath = orgUnit ? getOrgUnitPath(orgUnits, orgUnit.id) : '';
        const haystack = `${getEmployeeFullName(employee)} ${employee.title} ${employee.email ?? ''} ${orgPath}`.toLowerCase();
        return haystack.includes(normalized);
      })
      .slice(0, 12);
  }, [employees, excludeIds, orgUnits, query, value]);

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

  const handleAdd = (employeeId: string) => {
    if (value.includes(employeeId) || excludeIds?.has(employeeId)) {
      return;
    }
    onChange([...value, employeeId]);
    setQuery('');
    setOpen(false);
  };

  const handleRemove = (employeeId: string) => {
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
      handleAdd(filtered[highlightIndex]!.id);
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
      {open && filtered.length > 0 ? (
        <ul
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {filtered.map((employee, index) => {
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
                  onClick={() => handleAdd(employee.id)}
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
      {open && query.trim() && filtered.length === 0 ? (
        <p className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 shadow-lg">
          Nema rezultata.
        </p>
      ) : null}
    </div>
  );
};
