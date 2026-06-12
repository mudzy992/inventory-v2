import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '../utils/cn';
import type { PageId } from './page-id';
import { pageIdToPath } from '../routes/app-routes';

interface SidebarNavButtonProps {
  pageId: PageId;
  collapsed: boolean;
  label: string;
  icon: LucideIcon;
  visible: boolean;
  title?: string;
  className?: string;
  badge?: number;
  children?: ReactNode;
  onNavigateComplete?: () => void;
  alsoActivePaths?: string[];
  matchNested?: boolean;
}

export const SidebarNavButton = ({
  pageId,
  collapsed,
  label,
  icon: Icon,
  visible,
  title,
  className,
  badge,
  children,
  onNavigateComplete,
  alsoActivePaths,
  matchNested = false,
}: SidebarNavButtonProps) => {
  const location = useLocation();
  if (!visible) {
    return null;
  }
  const isAlsoActive = alsoActivePaths?.includes(location.pathname) ?? false;
  return (
    <NavLink
      to={pageIdToPath(pageId)}
      end={!matchNested}
      title={title ?? (collapsed ? label : undefined)}
      onClick={onNavigateComplete}
      className={({ isActive }) =>
        cn(
          'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
          isActive || isAlsoActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800',
          className,
        )
      }
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
    </NavLink>
  );
};
