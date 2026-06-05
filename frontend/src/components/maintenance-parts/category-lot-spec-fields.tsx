import type { Category } from '../../types';
import { getLotSpecFieldsForCategory } from '../../helpers/category-lot-spec-fields.util';
import { inputClass, labelClass, selectClass } from '../ui/form-styles';

interface CategoryLotSpecFieldsProps {
  category: Category | undefined;
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
}

export const CategoryLotSpecFields = ({ category, values, onChange }: CategoryLotSpecFieldsProps) => {
  const fields = getLotSpecFieldsForCategory(category);
  if (fields.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2 border-t border-gray-200 pt-3">
      <p className="text-xs font-medium text-gray-600">Specifikacije (lot)</p>
      {fields.map((field) => (
        <div key={field.id}>
          <label className={labelClass}>
            {field.name}
            {field.required ? ' *' : ''}
          </label>
          {field.type === 'select' && field.options?.length ? (
            <select
              className={selectClass}
              value={values[field.id] ?? ''}
              onChange={(e) => onChange(field.id, e.target.value)}
            >
              <option value="">—</option>
              {field.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
              className={inputClass}
              value={values[field.id] ?? ''}
              onChange={(e) => onChange(field.id, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
};
