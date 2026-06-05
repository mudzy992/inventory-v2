import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { selectClass } from './form-styles';

interface PaginationControlsProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export const PaginationControls = ({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className = '',
}: PaginationControlsProps) => {
  if (total === 0) {
    return null;
  }
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div
      className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50 ${className}`}
    >
      <p className="text-sm text-gray-500">
        Prikazano {from}–{to} od {total}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange ? (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className={`${selectClass} w-auto py-1.5 text-sm`}
            aria-label="Veličina stranice"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size} / str
              </option>
            ))}
          </select>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          className="px-2 py-1.5"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Prethodna stranica"
        >
          <ChevronLeft size={16} />
        </Button>
        <span className="text-sm text-gray-600 min-w-[4.5rem] text-center">
          {page} / {Math.max(totalPages, 1)}
        </span>
        <Button
          type="button"
          variant="secondary"
          className="px-2 py-1.5"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Sljedeća stranica"
        >
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
};
