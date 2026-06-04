import { Switch } from '../ui/switch';
import { inputClass } from '../ui/form-styles';
import type { SettingDto } from '../../api/settings-api';

interface SettingFieldRowProps {
  row: SettingDto;
  disabled?: boolean;
  onChange: (value: string | number | boolean) => void;
}

export const SettingFieldRow = ({ row, disabled = false, onChange }: SettingFieldRowProps) => {
  const controlId = `setting-${row.key}`;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 border-b border-gray-100 last:border-0">
      <div className="min-w-0 flex-1">
        <label htmlFor={controlId} className="text-sm font-medium text-gray-900">
          {row.label || row.key}
        </label>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{row.description}</p>
      </div>
      <div className="flex-shrink-0">
        {row.valueType === 'boolean' ? (
          <Switch
            id={controlId}
            checked={row.value === true}
            disabled={disabled}
            aria-label={row.label || row.description}
            onCheckedChange={(checked) => onChange(checked)}
          />
        ) : row.valueType === 'number' ? (
          <input
            id={controlId}
            type="number"
            min={1}
            className={`${inputClass} w-24`}
            disabled={disabled}
            value={typeof row.value === 'number' ? row.value : Number(row.value)}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        ) : (
          <input
            id={controlId}
            type="text"
            className={`${inputClass} w-full sm:w-72`}
            disabled={disabled}
            value={String(row.value ?? '')}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    </div>
  );
};
