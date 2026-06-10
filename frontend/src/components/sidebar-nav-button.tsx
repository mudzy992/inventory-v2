import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../utils/cn';
import type { PageId } from './page-id';

interface SidebarNavButtonProps {
  pageId: PageId;
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  collapsed: boolean;
  label: string;
  icon: LucideIcon;
  visible: boolean;
  title?: string;
  className?: string;
  badge?: number;
  children?: ReactNode;
}

export const SidebarNavButton = ({
  pageId,
  currentPage,
  onNavigate,
  collapsed,
  label,
  icon: Icon,
  visible,
  title,
  className,
  badge,
  children,
}: SidebarNavButtonProps) => {
  if (!visible) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={() => onNavigate(pageId)}
      title={title ?? (collapsed ? label : undefined)}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
        currentPage === pageId ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800',
        className,
      )}
    >
      <span className="relative shrink-0">
        <Icon size={children ? 16 : 20} />
        {badge && badge > 0 ? (
          <span
            className={cn(
              'absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-4 text-center',
              collapsed ? 'block' : 'hidden',
            )}
            aria-hidden
          >
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </span>
      {!collapsed && (
        children ?? (
          <span className="flex-1 flex items-center justify-between gap-2 min-w-0">
            <span className="truncate">{label}</span>
            {badge && badge > 0 ? (
              <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-[18px] text-center">
                {badge > 99 ? '99+' : badge}
              </span>
            ) : null}
          </span>
        )
      )}
    </button>
  );
};
