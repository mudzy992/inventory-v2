import { useEffect, useMemo, useRef, useState } from 'react';
import type { Employee } from '../types';
import { cn } from '../utils/cn';
import {
  resolveCanonicalEmployeeTitle,
  searchEmployeeTitles,
} from './employee-title-suggestions';

interface EmployeeTitleAutocompleteProps {
  employees: Employee[];
  value: string;
  onChange: (title: string) => void;
  placeholder?: string;
  className?: string;
}

export const EmployeeTitleAutocomplete = ({
  employees,
  value,
  onChange,
  placeholder = 'Npr. Stručni saradnik',
  className,
}: EmployeeTitleAutocompleteProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const suggestions = useMemo(
    () => searchEmployeeTitles(employees, query),
    [employees, query],
  );

  useEffect(() => {
    setHighlightIndex(0);
  }, [suggestions.length, query]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const handleSelect = (title: string) => {
    onChange(title);
    setQuery(title);
    setOpen(false);
  };

  const handleBlur = () => {
    const canonical = resolveCanonicalEmployeeTitle(employees, query);
    onChange(canonical);
    setQuery(canonical);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightIndex((index) => Math.min(index + 1, Math.max(suggestions.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter' && suggestions[highlightIndex]) {
      event.preventDefault();
      handleSelect(suggestions[highlightIndex]!);
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
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          onChange(next);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        aria-label="Pozicija / titula"
        aria-expanded={open}
        aria-autocomplete="list"
        role="combobox"
      />
      {open && suggestions.length > 0 ? (
        <ul
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {suggestions.map((title, index) => (
            <li key={title} role="option" aria-selected={index === highlightIndex}>
              <button
                type="button"
                className={cn(
                  'w-full px-3 py-2 text-left hover:bg-gray-50',
                  index === highlightIndex && 'bg-blue-50',
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(title)}
              >
                <span className="block text-sm text-gray-800">{title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && query.trim() && suggestions.length === 0 ? (
        <p className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 shadow-lg">
          Nema sličnih pozicija — unesite novu vrijednost.
        </p>
      ) : null}
    </div>
  );
};
