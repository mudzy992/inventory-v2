import { useState, type KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';

interface CategoryFieldOptionsEditorProps {
  options: string[];
  onChange: (options: string[]) => void;
}

export const CategoryFieldOptionsEditor = ({
  options,
  onChange,
}: CategoryFieldOptionsEditorProps) => {
  const [draft, setDraft] = useState('');

  const handleAdd = () => {
    const value = draft.trim();
    if (!value) {
      return;
    }
    if (options.includes(value)) {
      setDraft('');
      return;
    }
    onChange([...options, value]);
    setDraft('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAdd();
    }
  };

  const handleRemove = (index: number) => {
    onChange(options.filter((_, i) => i !== index));
  };

  return (
    <div className="w-full mt-1 space-y-2">
      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
        Opcije izbora
      </label>
      {options.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {options.map((option, index) => (
            <li
              key={`${option}-${index}`}
              className="inline-flex items-center gap-1 rounded-full bg-white border border-gray-200 px-2 py-0.5 text-xs text-gray-700"
            >
              <span>{option}</span>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="text-gray-400 hover:text-red-600 p-0.5 rounded"
                aria-label={`Ukloni opciju ${option}`}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[10px] text-gray-400">Nema opcija — dodajte ispod.</p>
      )}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nova opcija"
          className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={12} />
          Dodaj
        </button>
      </div>
    </div>
  );
};
