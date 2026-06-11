import { Package } from 'lucide-react';
import type { Category } from '../../../types';
import type { CategoryBrowseStats } from '../../../helpers/category-browse-stats.util';

interface CategoryParentGridProps {
  parents: Category[];
  stats: Map<string, CategoryBrowseStats>;
  getSubCategoryCount: (parentId: string) => number;
  onSelect: (parentId: string) => void;
  emptyMessage?: string;
  countLabel?: string;
}

export const CategoryParentGrid = ({
  parents,
  stats,
  getSubCategoryCount,
  onSelect,
  emptyMessage = 'Nema kategorija.',
  countLabel = 'lotova',
}: CategoryParentGridProps) => (
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {parents.map((row) => {
      const rowStats = stats.get(row.id);
      return (
        <button
          key={row.id}
          type="button"
          onClick={() => onSelect(row.id)}
          className="text-left bg-white rounded-xl border border-gray-100 p-4 hover:border-blue-200 hover:shadow-sm transition-all"
        >
          <div className="flex items-start gap-3">
            <Package size={20} className="text-blue-500 mt-0.5" />
            <div>
              <h3 className="font-medium text-gray-900">{row.name}</h3>
              <p className="text-xs text-gray-500 mt-1">
                {getSubCategoryCount(row.id)} podkategorija
                {rowStats ? ` · ${rowStats.lotCount} ${countLabel} · ${rowStats.qty} kom` : ''}
              </p>
            </div>
          </div>
        </button>
      );
    })}
    {parents.length === 0 ? (
      <p className="text-sm text-gray-400 col-span-full">{emptyMessage}</p>
    ) : null}
  </div>
);
