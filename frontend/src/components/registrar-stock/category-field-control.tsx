import type { CategoryField } from '../../types';
import { inputClass, labelClass, selectClass } from '../ui/form-styles';

interface CategoryFieldControlProps {
  field: CategoryField;
  value: string;
  onChange: (next: string) => void;
}

export const CategoryFieldControl = ({ field, value, onChange }: CategoryFieldControlProps) => (
  <div>
    <label className={labelClass}>
      {field.name}
      {field.required ? ' *' : ''}
    </label>
    {field.type === 'select' ? (
      <select value={value} onChange={(event) => onChange(event.target.value)} className={selectClass}>
        <option value="">—</option>
        {field.options?.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    ) : (
      <input
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    )}
  </div>
);
