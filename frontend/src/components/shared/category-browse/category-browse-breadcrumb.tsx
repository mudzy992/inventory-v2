import { ChevronRight } from 'lucide-react';

interface CategoryBrowseBreadcrumbProps {
  parent: { name: string } | null;
  subCategory: { name: string } | null;
  onNavigateRoot: () => void;
  onNavigateParent: () => void;
  rootLabel?: string;
}

export const CategoryBrowseBreadcrumb = ({
  parent,
  subCategory,
  onNavigateRoot,
  onNavigateParent,
  rootLabel = 'Kategorije',
}: CategoryBrowseBreadcrumbProps) => (
  <div className="flex flex-wrap items-center gap-1 text-sm text-gray-600">
    <button type="button" className="hover:text-gray-900" onClick={onNavigateRoot}>
      {rootLabel}
    </button>
    {parent ? (
      <>
        <ChevronRight size={14} />
        <button type="button" className="hover:text-gray-900" onClick={onNavigateParent}>
          {parent.name}
        </button>
      </>
    ) : null}
    {subCategory ? (
      <>
        <ChevronRight size={14} />
        <span className="font-medium text-gray-900">{subCategory.name}</span>
      </>
    ) : null}
  </div>
);
