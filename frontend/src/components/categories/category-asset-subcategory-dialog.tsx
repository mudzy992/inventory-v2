import { useState } from 'react';
import { FileText, Layers, Wrench } from 'lucide-react';
import type { Category, CategoryField } from '../../types';
import { CategoryFieldEditor } from './category-field-editor';
import { CategoryMaintenanceLinksEditor } from './category-maintenance-links-editor';
import { PageTabs } from '../ui/page-tabs';
import { inputClass, labelClass } from '../ui/form-styles';
import { ModalRoot } from '../ui/modal-root';

type AssetSubFormTab = 'details' | 'specification' | 'catalog';

interface CategoryAssetSubcategoryDialogProps {
  title: string;
  name: string;
  description: string;
  parentId: string | null;
  parentOptions: Category[];
  fields: CategoryField[];
  optionalFields: CategoryField[];
  linkedMaintenanceIds: string[];
  allCategories: Category[];
  linksLoading: boolean;
  saving: boolean;
  showCatalogTab: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onParentIdChange: (value: string | null) => void;
  onFieldsChange: (fields: CategoryField[]) => void;
  onOptionalFieldsChange: (fields: CategoryField[]) => void;
  onLinkedMaintenanceIdsChange: (ids: string[]) => void;
  onClose: () => void;
  onSave: () => void;
}

export const CategoryAssetSubcategoryDialog = ({
  title,
  name,
  description,
  parentId,
  parentOptions,
  fields,
  optionalFields,
  linkedMaintenanceIds,
  allCategories,
  linksLoading,
  saving,
  showCatalogTab,
  onNameChange,
  onDescriptionChange,
  onParentIdChange,
  onFieldsChange,
  onOptionalFieldsChange,
  onLinkedMaintenanceIdsChange,
  onClose,
  onSave,
}: CategoryAssetSubcategoryDialogProps) => {
  const [activeTab, setActiveTab] = useState<AssetSubFormTab>('details');
  const tabs = [
    { id: 'details' as const, label: 'Osnovni detalji', icon: FileText },
    { id: 'specification' as const, label: 'Specifikacija', icon: Layers },
    ...(showCatalogTab
      ? [{ id: 'catalog' as const, label: 'Katalog dijelova', icon: Wrench }]
      : []),
  ];
  return (
    <ModalRoot open onClose={onClose} size="xl" panelClassName="bg-white shadow-xl max-w-2xl">
      <div className="bg-white rounded-xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-gray-500 mt-1">Podkategorija opreme — host za inventar i ugradnju dijelova</p>
        </div>
        <div className="px-6 pt-4 shrink-0">
          <PageTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {activeTab === 'details' ? (
            <>
              <div>
                <label className={labelClass}>Naziv *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  className={inputClass}
                  placeholder="Npr. Radna stanica"
                />
              </div>
              <div>
                <label className={labelClass}>Opis</label>
                <textarea
                  value={description}
                  onChange={(e) => onDescriptionChange(e.target.value)}
                  className={inputClass}
                  rows={2}
                  placeholder="Opis kategorije..."
                />
              </div>
              <div>
                <label className={labelClass}>Glavna kategorija</label>
                <select
                  value={parentId || ''}
                  onChange={(e) => onParentIdChange(e.target.value || null)}
                  className={inputClass}
                >
                  <option value="">— Odaberite glavnu kategoriju —</option>
                  {parentOptions.map((parent) => (
                    <option key={parent.id} value={parent.id}>{parent.name}</option>
                  ))}
                </select>
              </div>
            </>
          ) : null}
          {activeTab === 'specification' ? (
            <>
              <CategoryFieldEditor
                fields={fields}
                onChange={onFieldsChange}
                label="Polja po komadu"
                mode="unit"
              />
              <CategoryFieldEditor
                fields={optionalFields}
                onChange={onOptionalFieldsChange}
                label="Polja lota"
                mode="lot"
              />
            </>
          ) : null}
          {activeTab === 'catalog' && showCatalogTab ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Odaberite grupe održavanja i tipove dijelova koji se mogu ugraditi na opremu u ovoj kategoriji.
              </p>
              {linksLoading ? (
                <p className="text-xs text-gray-400">Učitavanje kataloga...</p>
              ) : (
                <CategoryMaintenanceLinksEditor
                  linkedIds={linkedMaintenanceIds}
                  allCategories={allCategories}
                  onChange={onLinkedMaintenanceIdsChange}
                />
              )}
            </div>
          ) : null}
        </div>
        <div className="p-6 border-t border-gray-100 flex justify-end gap-3 shrink-0 bg-white rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            Odustani
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
          >
            {saving ? 'Čuvanje...' : 'Sačuvaj'}
          </button>
        </div>
      </div>
    </ModalRoot>
  );
};
