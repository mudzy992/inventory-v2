import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../utils/cn';

export interface SearchableOption {
  id: string;
  label: string;
  subLabel?: string;
  searchText?: string;
}

interface SearchableAutocompleteProps {
  options: SearchableOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  ariaLabel?: string;
  emptyOption?: SearchableOption;
  excludeIds?: ReadonlySet<string>;
}

export const SearchableAutocomplete = ({
  options,
  value,
  onChange,
  placeholder = 'Pretraži…',
  required = false,
  disabled = false,
  id,
  className,
  ariaLabel = 'Odabir',
  emptyOption,
  excludeIds,
}: SearchableAutocompleteProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInheritValue = Boolean(emptyOption && value === emptyOption.id);
  const selected = isInheritValue
    ? emptyOption!
    : options.find((row) => row.id === value) ?? null;
  const [query, setQuery] = useState(emptyOption?.label ?? '');
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  useEffect(() => {
    if (selected) {
      setQuery(selected.label);
      return;
    }
    setQuery('');
  }, [selected?.id, selected?.label]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const visible = options.filter((row) => !excludeIds?.has(row.id));
    const rows = emptyOption ? [emptyOption, ...visible] : visible;
    const sorted = [...rows].sort((a, b) => {
      if (emptyOption && a.id === emptyOption.id) {
        return -1;
      }
      if (emptyOption && b.id === emptyOption.id) {
        return 1;
      }
      return a.label.localeCompare(b.label);
    });
    const isInheritPlaceholderActive =
      Boolean(emptyOption) && value === emptyOption?.id && query === (emptyOption?.label ?? '');
    if (!normalized || isInheritPlaceholderActive) {
      return sorted;
    }
    return sorted.filter((row) => {
      const haystack = `${row.label} ${row.subLabel ?? ''} ${row.searchText ?? ''}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [options, query, emptyOption, excludeIds, value]);

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

  const handleSelect = (row: SearchableOption) => {
    onChange(row.id);
    setQuery(row.label);
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
        required={required && !isInheritValue && !value}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (!event.target.value.trim() && emptyOption) {
            onChange(emptyOption.id);
          } else if (!event.target.value.trim()) {
            onChange('');
          }
        }}
        disabled={disabled}
        onFocus={(event) => {
          if (disabled) {
            return;
          }
          setOpen(true);
          if (emptyOption && value === emptyOption.id && query === emptyOption.label) {
            event.currentTarget.select();
          }
        }}
        onBlur={() => {
          if (emptyOption && !query.trim()) {
            onChange(emptyOption.id);
            setQuery(emptyOption.label);
          } else if (selected) {
            setQuery(selected.label);
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
      {open && filtered.length > 0 ? (
        <ul
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {filtered.map((row, index) => (
            <li key={row.id || '__empty'} role="option" aria-selected={index === highlightIndex}>
              <button
                type="button"
                className={cn(
                  'w-full px-3 py-2 text-left hover:bg-gray-50',
                  index === highlightIndex && 'bg-blue-50',
                  emptyOption && row.id === emptyOption.id && 'bg-slate-50/80',
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(row)}
              >
                <span className="block text-sm font-medium text-gray-800">{row.label}</span>
                {row.subLabel ? (
                  <span className="block text-xs text-gray-500 truncate">{row.subLabel}</span>
                ) : null}
              </button>
            </li>
          ))}
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
