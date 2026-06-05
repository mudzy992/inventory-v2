import { Plus, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { CategoryField } from '../../types';
import { CategoryFieldOptionsEditor } from './category-field-options-editor';

interface CategoryFieldEditorProps {
  fields: CategoryField[];
  onChange: (fields: CategoryField[]) => void;
  label: string;
}

export const CategoryFieldEditor = ({ fields, onChange, label }: CategoryFieldEditorProps) => {
  const handleAddField = () => {
    onChange([
      ...fields,
      { id: uuidv4(), name: '', type: 'text', required: false, unique: false },
    ]);
  };
  const handleUpdateField = (index: number, update: Partial<CategoryField>) => {
    const next = [...fields];
    next[index] = { ...next[index], ...update };
    onChange(next);
  };
  const handleRemoveField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="space-y-2 mb-2">
        {fields.map((field, i) => (
          <div key={field.id} className="flex gap-2 items-start bg-gray-50 rounded-lg p-2 flex-wrap">
            <input
              type="text"
              value={field.name}
              onChange={(e) => handleUpdateField(i, { name: e.target.value })}
              placeholder="Naziv polja"
              className="flex-1 min-w-[120px] border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <select
              value={field.type}
              onChange={(e) => handleUpdateField(i, { type: e.target.value as CategoryField['type'] })}
              className="border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="text">Tekst</option>
              <option value="number">Broj</option>
              <option value="date">Datum</option>
              <option value="select">Izbor</option>
            </select>
            <label className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => handleUpdateField(i, { required: e.target.checked })}
                className="rounded"
              />
              Obavezno
            </label>
            <label className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
              <input
                type="checkbox"
                checked={field.unique}
                onChange={(e) => handleUpdateField(i, { unique: e.target.checked })}
                className="rounded"
              />
              Unikat
            </label>
            <button
              type="button"
              onClick={() => handleRemoveField(i)}
              className="text-red-400 hover:text-red-600 p-1 flex-shrink-0"
              aria-label="Ukloni polje"
            >
              <Trash2 size={12} />
            </button>
            {field.type === 'select' ? (
              <CategoryFieldOptionsEditor
                options={field.options || []}
                onChange={(options) => handleUpdateField(i, { options })}
              />
            ) : null}
          </div>
        ))}
        {fields.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded-lg">
            Nema polja
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={handleAddField}
        className="w-full flex items-center justify-center gap-1 text-xs text-blue-600 hover:text-blue-800 border border-dashed border-blue-200 rounded-lg py-2 hover:bg-blue-50 transition-colors"
      >
        <Plus size={12} /> Dodaj polje
      </button>
    </div>
  );
};
