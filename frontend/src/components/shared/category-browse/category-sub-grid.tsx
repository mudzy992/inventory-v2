import type { Category } from '../../../types';
import type { CategoryBrowseStats } from '../../../helpers/category-browse-stats.util';

interface CategorySubGridProps {
  subCategories: Category[];
  stats: Map<string, CategoryBrowseStats>;
  onSelect: (subCategoryId: string) => void;
  emptyMessage?: string;
  statsSuffix?: string;
  countLabel?: string;
}

export const CategorySubGrid = ({
  subCategories,
  stats,
  onSelect,
  emptyMessage = 'Nema podkategorija.',
  statsSuffix = 'kom na skladištu',
  countLabel = 'lotova',
}: CategorySubGridProps) => (
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {subCategories.map((row) => {
      const rowStats = stats.get(row.id);
      return (
        <button
          key={row.id}
          type="button"
          onClick={() => onSelect(row.id)}
          className="text-left bg-white rounded-xl border border-gray-100 p-4 hover:border-blue-200 hover:shadow-sm transition-all"
        >
          <h3 className="font-medium text-gray-900">{row.name}</h3>
          <p className="text-xs text-gray-500 mt-1">
            {rowStats
              ? `${rowStats.lotCount} ${countLabel} · ${rowStats.qty} ${statsSuffix}`
              : 'Nema stavki'}
          </p>
        </button>
      );
    })}
    {subCategories.length === 0 ? (
      <p className="text-sm text-gray-400 col-span-full">{emptyMessage}</p>
    ) : null}
  </div>
);
