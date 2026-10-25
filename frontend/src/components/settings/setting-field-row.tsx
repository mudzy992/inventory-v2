import { Switch } from '../ui/switch';
import { inputClass } from '../ui/form-styles';
import type { SettingDto } from '../../api/settings-api';
import { useDebouncedSettingValue } from './settings-field.util';

interface SettingFieldRowProps {
  row: SettingDto;
  disabled?: boolean;
  dependencyDisabled?: boolean;
  onChange: (value: string | number | boolean) => void;
}

const rowClass =
  'flex flex-col gap-3 py-4 border-b border-gray-100 last:border-0 lg:flex-row lg:items-center lg:gap-6';
const childRowClass =
  'flex flex-col gap-3 py-4 border-b border-gray-100 last:border-0 lg:flex-row lg:items-center lg:gap-6 ml-0 lg:ml-4 pl-0 lg:pl-4 border-l-0 lg:border-l-2 lg:border-blue-100';
const labelClass = 'min-w-0 lg:w-[36%] lg:max-w-md lg:flex-shrink-0';
const controlClass = 'flex w-full min-w-0 flex-1 lg:justify-end';

export const SettingFieldRow = ({
  row,
  disabled = false,
  dependencyDisabled = false,
  onChange,
}: SettingFieldRowProps) => {
  const controlId = `setting-${row.key}`;
  const isInfo = row.display === 'info';
  const isDeprecated = row.display === 'deprecated';
  const fieldDisabled = disabled || dependencyDisabled || isInfo || isDeprecated;
  const rowLayoutClass = row.dependsOn ? childRowClass : rowClass;
  const debounced = useDebouncedSettingValue(row.value, onChange);

  if (isInfo) {
    return (
      <div className={rowLayoutClass}>
        <div className={labelClass}>
          <p className="text-sm font-medium text-gray-900">{row.label || row.key}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{row.description}</p>
          {row.detail ? <p className="text-xs text-gray-400 mt-1 leading-relaxed">{row.detail}</p> : null}
        </div>
        <div className={controlClass}>
          <pre className="w-full overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 lg:max-w-2xl">
            {String(row.value ?? '')}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className={`${rowLayoutClass} ${dependencyDisabled ? 'opacity-50' : ''}`}>
      <div className={labelClass}>
        <label htmlFor={controlId} className="text-sm font-medium text-gray-900">
          {row.label || row.key}
          {isDeprecated ? (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
              Zastarjelo
            </span>
          ) : null}
        </label>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{row.description}</p>
        {row.detail ? <p className="text-xs text-gray-400 mt-1 leading-relaxed">{row.detail}</p> : null}
        {dependencyDisabled && row.dependsOn ? (
          <p className="text-xs text-amber-700 mt-1">Zahtijeva uključenu nadređenu postavku.</p>
        ) : null}
      </div>
      <div className={controlClass}>
        {row.valueType === 'boolean' ? (
          <Switch
            id={controlId}
            checked={row.value === true}
            disabled={fieldDisabled}
            aria-label={row.label || row.description}
            onCheckedChange={(checked) => onChange(checked)}
          />
        ) : row.valueType === 'number' ? (
          <input
            id={controlId}
            type="number"
            min={1}
            className={`${inputClass} w-full sm:w-32 md:w-40`}
            disabled={fieldDisabled}
            value={typeof debounced.draft === 'number' ? debounced.draft : Number(debounced.draft)}
            onChange={(e) => debounced.setDraft(Number(e.target.value))}
            onBlur={debounced.commitDraft}
          />
        ) : (
          <input
            id={controlId}
            type="text"
            className={`${inputClass} w-full lg:max-w-2xl`}
            disabled={fieldDisabled}
            value={String(debounced.draft ?? '')}
            onChange={(e) => debounced.setDraft(e.target.value)}
            onBlur={debounced.commitDraft}
          />
        )}
      </div>
    </div>
  );
};
