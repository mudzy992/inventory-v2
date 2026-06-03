import type { Employee } from '../../types';
import { getEmployeeFullName } from '../../helpers';
import { labelClass, selectClass } from './form-styles';

interface EmployeeMultiPickerProps {
  employees: Employee[];
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  hint?: string;
  minHeightClass?: string;
}

export const EmployeeMultiPicker = ({
  employees,
  value,
  onChange,
  label = 'Članovi komisije',
  hint = 'Prvi odabrani = predsjednik. Ctrl+klik za više.',
  minHeightClass = 'min-h-[88px]',
}: EmployeeMultiPickerProps) => {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(Array.from(event.target.selectedOptions).map((option) => option.value));
  };
  if (employees.length === 0) {
    return (
      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
        Nema radnika u registru — dodajte ih u meniju Radnici.
      </p>
    );
  }
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {hint ? <p className="text-xs text-gray-400 mb-1">{hint}</p> : null}
      <select
        multiple
        value={value}
        onChange={handleChange}
        className={`${selectClass} ${minHeightClass}`}
        aria-label={label}
      >
        {employees.map((emp) => (
          <option key={emp.id} value={emp.id}>
            {getEmployeeFullName(emp)} — {emp.title}
          </option>
        ))}
      </select>
    </div>
  );
};
