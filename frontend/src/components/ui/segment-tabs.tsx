import type { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface SegmentTabItem<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
}

interface SegmentTabsProps<T extends string> {
  tabs: SegmentTabItem<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
  className?: string;
}

export const SegmentTabs = <T extends string>({
  tabs,
  activeTab,
  onChange,
  className,
}: SegmentTabsProps<T>) => (
  <div
    className={cn(
      'grid gap-1 rounded-xl bg-slate-100/90 p-1',
      tabs.length === 2 && 'grid-cols-2',
      tabs.length === 3 && 'grid-cols-3',
      tabs.length >= 4 && 'grid-cols-2 sm:grid-cols-4',
      className,
    )}
    role="tablist"
  >
    {tabs.map((tab) => {
      const Icon = tab.icon;
      const isActive = activeTab === tab.id;
      return (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={isActive}
          onClick={() => onChange(tab.id)}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-xs font-medium transition-all duration-200 sm:text-sm',
            isActive
              ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
              : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {Icon ? <Icon size={14} className={isActive ? 'text-blue-600' : 'text-slate-400'} /> : null}
          <span className="truncate">{tab.label}</span>
        </button>
      );
    })}
  </div>
);
