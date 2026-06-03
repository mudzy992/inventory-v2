import type { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface PageTabItem<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
}

interface PageTabsProps<T extends string> {
  tabs: PageTabItem<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
  className?: string;
}

export const PageTabs = <T extends string>({
  tabs,
  activeTab,
  onChange,
  className,
}: PageTabsProps<T>) => (
  <div className={cn('flex flex-wrap gap-2 border-b border-gray-100 pb-2 overflow-x-auto', className)}>
    {tabs.map((row) => {
      const Icon = row.icon;
      return (
        <button
          key={row.id}
          type="button"
          onClick={() => onChange(row.id)}
          className={cn(
            'inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border whitespace-nowrap shrink-0',
            activeTab === row.id
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
          )}
        >
          {Icon ? <Icon size={14} /> : null}
          {row.label}
        </button>
      );
    })}
  </div>
);
