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
      <Icon size={children ? 16 : 20} />
      {!collapsed && (children ?? <span>{label}</span>)}
    </button>
  );
};
