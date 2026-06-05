import { useEffect, useMemo, useState } from 'react';
import { searchCatalogItemsApi, type EquipmentCatalogItem } from '../../api/equipment-catalog-api';
import { inputClass } from '../ui/form-styles';

interface CatalogItemAutocompleteProps {
  categoryId: string;
  value: EquipmentCatalogItem | null;
  onChange: (item: EquipmentCatalogItem | null) => void;
  disabled?: boolean;
}

export const CatalogItemAutocomplete = ({
  categoryId,
  value,
  onChange,
  disabled,
}: CatalogItemAutocompleteProps) => {
  const [query, setQuery] = useState(value ? `${value.code} — ${value.name}` : '');
  const [items, setItems] = useState<EquipmentCatalogItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (value) {
      setQuery(`${value.code} — ${value.name}`);
    }
  }, [value]);

  useEffect(() => {
    if (!categoryId || !open) {
      return;
    }
    const term = query.includes('—') ? query.split('—')[0]?.trim() ?? query : query;
    const handle = window.setTimeout(() => {
      setLoading(true);
      void searchCatalogItemsApi({ categoryId, q: term.trim() || undefined })
        .then(setItems)
        .finally(() => setLoading(false));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [categoryId, query, open]);

  const showList = open && categoryId && (loading || items.length > 0);

  const hint = useMemo(() => {
    if (!categoryId) {
      return 'Prvo odaberite kategoriju';
    }
    return 'Pretražite po šifri ili nazivu';
  }, [categoryId]);

  return (
    <div className="relative">
      <input
        type="text"
        className={inputClass}
        disabled={disabled || !categoryId}
        placeholder={hint}
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(null);
          setOpen(true);
        }}
      />
      {showList ? (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm">
          {loading ? (
            <li className="px-3 py-2 text-gray-400">Učitavanje…</li>
          ) : null}
          {!loading &&
            items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-gray-50"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(item);
                    setQuery(`${item.code} — ${item.name}`);
                    setOpen(false);
                  }}
                >
                  <span className="font-mono text-xs text-gray-500">{item.code}</span>
                  <span className="ml-2">{item.name}</span>
                </button>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
};
