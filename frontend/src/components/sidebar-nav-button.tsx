import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '../utils/cn';
import type { PageId } from './page-id';
import { pageIdToPath } from '../routes/app-routes';
import { prefetchPage } from '../routes/page-loaders';

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
      onMouseEnter={() => prefetchPage(pageId)}
      onFocus={() => prefetchPage(pageId)}
      onClick={onNavigateComplete}
      className={({ isActive }) =>
        cn(
          'flex w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-sm transition-colors',
          isActive || isAlsoActive
            ? 'bg-brand-soft font-semibold text-brand-ink'
            : 'text-ink-muted hover:bg-subtle hover:text-ink',
          className,
        )
      }
    >
      <span className="relative shrink-0">
        <Icon size={children ? 16 : 20} />
        {badge && badge > 0 ? (
          <span
            className={cn(
              'absolute -right-1.5 -top-1.5 h-4 min-w-[16px] rounded-full bg-danger-ink px-1 text-center text-[10px] font-semibold leading-4 text-white',
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
              <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-danger-ink text-white text-[10px] font-semibold leading-[18px] text-center">
                {badge > 99 ? '99+' : badge}
              </span>
            ) : null}
          </span>
        )
      )}
    </NavLink>
  );
};
