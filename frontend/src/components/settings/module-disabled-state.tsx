import { EmptyState } from '../ui/empty-state';

interface ModuleDisabledStateProps {
  title?: string;
}

export const ModuleDisabledState = ({
  title = 'Modul je isključen u postavkama aplikacije.',
}: ModuleDisabledStateProps) => (
  <div className="p-6">
    <EmptyState message={title} />
  </div>
);
