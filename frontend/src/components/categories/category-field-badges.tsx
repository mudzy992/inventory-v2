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
  const unitFields = fields;
  const lotFields = optionalFields;
  const allFields = [
    ...unitFields.map((field) => ({ field, kind: 'unit' as const })),
    ...lotFields.map((field) => ({ field, kind: 'lot' as const })),
  ];
  if (allFields.length === 0) {
    return null;
  }
  const visible = allFields.slice(0, maxVisible);
  const hiddenCount = allFields.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1 mt-2 ml-6">
      {visible.map(({ field, kind }) => (
        <span
          key={field.id}
          className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-500"
        >
          {field.name}
          {kind === 'unit' && field.unique ? (
            <span className="text-purple-500 ml-0.5" title="Unikat po komadu">●</span>
          ) : null}
          {kind === 'lot' && field.required ? (
            <span className="text-red-400 ml-0.5" title="Obavezno na lotu">*</span>
          ) : null}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="text-[10px] text-gray-400">+{hiddenCount} više</span>
      ) : null}
    </div>
  );
};
