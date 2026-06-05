import { Wrench } from 'lucide-react';

interface CategoryMaintenanceCatalogBadgesProps {
  labels: string[];
}

export const CategoryMaintenanceCatalogBadges = ({
  labels,
}: CategoryMaintenanceCatalogBadgesProps) => {
  if (labels.length === 0) {
    return (
      <span className="text-[10px] text-gray-400 italic">Bez kataloga dijelova</span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1.5 ml-6">
      <Wrench size={11} className="text-amber-600 shrink-0" aria-hidden />
      {labels.map((label) => (
        <span
          key={label}
          className="text-[10px] bg-amber-50 text-amber-800 border border-amber-100 px-1.5 py-0.5 rounded"
        >
          {label}
        </span>
      ))}
    </div>
  );
};
