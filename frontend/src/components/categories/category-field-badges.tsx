import type { CategoryField } from '../../types';

interface CategoryFieldBadgesProps {
  fields: CategoryField[];
  optionalFields?: CategoryField[];
  maxVisible?: number;
}

export const CategoryFieldBadges = ({
  fields,
  optionalFields = [],
  maxVisible = 5,
}: CategoryFieldBadgesProps) => {
  const allFields = [...fields, ...optionalFields];
  if (allFields.length === 0) {
    return null;
  }
  const visible = allFields.slice(0, maxVisible);
  const hiddenCount = allFields.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1 mt-2 ml-6">
      {visible.map((field) => (
        <span
          key={field.id}
          className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-500"
        >
          {field.name}
          {field.unique ? <span className="text-purple-500 ml-0.5" title="Unikat">●</span> : null}
          {field.required ? <span className="text-red-400 ml-0.5" title="Obavezno">*</span> : null}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="text-[10px] text-gray-400">+{hiddenCount} više</span>
      ) : null}
    </div>
  );
};
