import { useCallback, useState } from 'react';
import { useStore, useRefreshData } from '../useStore';
import { createCategoryApi, deleteCategoryApi, updateCategoryApi } from '../api/data-api';
import {
  fetchCategoryMaintenanceLinksApi,
  setCategoryMaintenanceLinksApi,
} from '../api/maintenance-parts-api';
import { ApiError } from '../api/client';
import { useToast } from '../contexts/toast-context';
import { usePublicSettings } from '../contexts/public-settings-context';
import { useCategoryMaintenanceLinksMap } from '../hooks/use-category-maintenance-links-map';
import {
  Plus, Edit2, Trash2, ChevronDown, ChevronRight, Settings, Folder, FolderOpen, Layers, Wrench,
} from 'lucide-react';
import { getParentCategories, getSubCategories, getEquipmentStats } from '../store';
import { v4 as uuidv4 } from 'uuid';
import type { Category, CategoryField, CategoryKind } from '../types';
import { CategoryFieldEditor } from './categories/category-field-editor';
import { CategoryFieldBadges } from './categories/category-field-badges';
import { CategoryMaintenanceCatalogBadges } from './categories/category-maintenance-catalog-badges';
import { CategoryAssetSubcategoryDialog } from './categories/category-asset-subcategory-dialog';
import { isAssetLeafCategory } from '../helpers/expand-maintenance-catalog.util';
import { EquipmentCatalogPanel } from './catalog/equipment-catalog-panel';
import { PageTabs } from './ui/page-tabs';
import { PageHeaderRow } from './ui/page-header-row';
import { inputClass, labelClass } from './ui/form-styles';

type CategoriesTabId = 'asset' | 'maintenance' | 'catalog';

export function CategoriesPage() {
  const [state] = useStore();
  const refresh = useRefreshData();
  const { toastError, toastSuccess } = useToast();
  const { getBoolean } = usePublicSettings();
  const maintenanceEnabled = getBoolean('features.maintenance_parts', true);
  const catalogEnabled = getBoolean('features.equipment_catalog', true);
  const [activeTab, setActiveTab] = useState<CategoriesTabId>('asset');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null);
  const [fName, setFName] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fParentId, setFParentId] = useState<string | null>(null);
  const [fCategoryKind, setFCategoryKind] = useState<CategoryKind>('ASSET');
  const [fFields, setFFields] = useState<CategoryField[]>([]);
  const [fOptFields, setFOptFields] = useState<CategoryField[]>([]);
  const [fLinkedMaintenanceIds, setFLinkedMaintenanceIds] = useState<string[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { labelsByHostId, refresh: refreshLinksMap } = useCategoryMaintenanceLinksMap(
    state.categories,
    activeTab === 'asset',
  );
  const assetParentCategories = getParentCategories().filter(
    (row) => (row.categoryKind ?? 'ASSET') === 'ASSET',
  );
  const maintenanceParentCategories = state.categories.filter(
    (row) => row.categoryKind === 'MAINTENANCE' && !row.parentId,
  );
  const formParentOptions = fCategoryKind === 'MAINTENANCE'
    ? maintenanceParentCategories
    : assetParentCategories;
  const isFormSubCategory = Boolean(fParentId || (editing && editing.parentId));
  const formCategoryForLeafCheck: Category | null = editing ?? (fParentId
    ? {
        id: '__draft__',
        name: fName,
        description: fDesc,
        parentId: fParentId,
        categoryKind: fCategoryKind,
        fields: fFields,
        optionalFields: fOptFields,
      }
    : null);
  const showMaintenanceLinksInForm = maintenanceEnabled
    && fCategoryKind === 'ASSET'
    && isFormSubCategory
    && formCategoryForLeafCheck
    && isAssetLeafCategory(formCategoryForLeafCheck, state.categories);
  const isAssetSubcategoryForm = showForm && fCategoryKind === 'ASSET' && isFormSubCategory;
  const loadMaintenanceLinks = useCallback(async (hostCategoryId: string) => {
    setLinksLoading(true);
    try {
      const rows = await fetchCategoryMaintenanceLinksApi(hostCategoryId);
      setFLinkedMaintenanceIds(rows.map((row) => row.maintenanceCategory.id));
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri učitavanju kataloga');
      setFLinkedMaintenanceIds([]);
    } finally {
      setLinksLoading(false);
    }
  }, [toastError]);
  const resetForm = () => {
    setEditing(null);
    setFName('');
    setFDesc('');
    setFParentId(null);
    setFFields([]);
    setFOptFields([]);
    setFLinkedMaintenanceIds([]);
  };
  const openAddParent = (kind: CategoryKind) => {
    resetForm();
    setFCategoryKind(kind);
    setShowForm(true);
  };
  const openAddSub = (parentId: string, parentKind: CategoryKind = 'ASSET') => {
    resetForm();
    setFParentId(parentId);
    setFCategoryKind(parentKind);
    setFFields(
      parentKind === 'ASSET'
        ? [{ id: uuidv4(), name: 'Serijski broj', type: 'text', required: true, unique: true }]
        : [],
    );
    setShowForm(true);
  };
  const openEdit = async (cat: Category) => {
    setEditing(cat);
    setFName(cat.name);
    setFDesc(cat.description);
    setFParentId(cat.parentId);
    setFCategoryKind(cat.categoryKind ?? 'ASSET');
    setFFields([...cat.fields]);
    setFOptFields([...cat.optionalFields]);
    setFLinkedMaintenanceIds([]);
    setShowForm(true);
    if (
      maintenanceEnabled
      && (cat.categoryKind ?? 'ASSET') === 'ASSET'
      && isAssetLeafCategory(cat, state.categories)
    ) {
      await loadMaintenanceLinks(cat.id);
    }
  };
  const handleSave = async () => {
    if (!fName.trim()) {
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: fName.trim(),
        description: fDesc.trim(),
        parentId: fParentId,
        categoryKind: fCategoryKind,
        fields: fFields,
        optionalFields: fOptFields,
      };
      const saved = editing
        ? await updateCategoryApi(editing.id, payload)
        : await createCategoryApi(payload);
      if (showMaintenanceLinksInForm) {
        await setCategoryMaintenanceLinksApi(saved.id, fLinkedMaintenanceIds);
      }
      await refresh();
      await refreshLinksMap();
      setShowForm(false);
      toastSuccess(editing ? 'Kategorija sačuvana' : 'Kategorija dodana');
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri spremanju');
    } finally {
      setSaving(false);
    }
  };
  const handleDelete = async (id: string) => {
    const hasEquipment = state.equipment.some((e) => e.categoryId === id);
    const hasSubCategories = state.categories.some((c) => c.parentId === id);
    if (hasEquipment) {
      toastError('Nije moguće obrisati kategoriju koja sadrži opremu.');
      return;
    }
    if (hasSubCategories) {
      toastError('Nije moguće obrisati kategoriju koja ima podkategorije. Prvo obrišite podkategorije.');
      return;
    }
    if (!confirm('Obrisati ovu kategoriju?')) {
      return;
    }
    try {
      await deleteCategoryApi(id);
      await refresh();
      await refreshLinksMap();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri brisanju');
    }
  };
  const formTitle = editing
    ? (editing.parentId ? 'Uredi podkategoriju' : 'Uredi glavnu kategoriju')
    : (fParentId ? 'Nova podkategorija' : 'Nova glavna kategorija');
  return (
    <div>
      <PageHeaderRow
        title="Kategorije"
        description="Oprema i dijelovi za održavanje — odvojene hijerarhije"
        actions={
          activeTab !== 'catalog' ? (
            <button
              type="button"
              onClick={() => openAddParent(activeTab === 'asset' ? 'ASSET' : 'MAINTENANCE')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white ${
                activeTab === 'asset' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              <Plus size={16} />
              {activeTab === 'asset' ? 'Nova glavna (oprema)' : 'Nova grupa (održavanje)'}
            </button>
          ) : undefined
        }
      />
      <PageTabs
        tabs={[
          { id: 'asset', label: 'Kategorije opreme', icon: Folder },
          { id: 'maintenance', label: 'Kategorije održavanja', icon: Wrench },
          ...(catalogEnabled
            ? [{ id: 'catalog' as const, label: 'Šifrarnik opreme', icon: Layers }]
            : []),
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
        className="mb-6"
      />
      {activeTab === 'catalog' && catalogEnabled ? <EquipmentCatalogPanel /> : null}
      {activeTab === 'asset' ? (
        <div className="space-y-4">
          {assetParentCategories.map((parent) => {
            const subCategories = getSubCategories(parent.id);
            const isExpanded = expandedParentId === parent.id;
            const stats = getEquipmentStats(parent.id);
            return (
              <div key={parent.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div
                  className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors bg-gradient-to-r from-blue-50 to-transparent"
                  onClick={() => setExpandedParentId(isExpanded ? null : parent.id)}
                >
                  {isExpanded ? <FolderOpen size={20} className="text-blue-500" /> : <Folder size={20} className="text-blue-400" />}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-800">{parent.name}</h3>
                    <p className="text-xs text-gray-500">{parent.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">{subCategories.length} podkategorija</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{stats.total} stavki</span>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => openAddSub(parent.id)} className="text-green-500 hover:text-green-700 p-1" title="Dodaj podkategoriju">
                        <Plus size={14} />
                      </button>
                      <button type="button" onClick={() => void openEdit(parent)} className="text-blue-500 hover:text-blue-700 p-1"><Edit2 size={14} /></button>
                      <button type="button" onClick={() => void handleDelete(parent.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={14} /></button>
                    </div>
                    {isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                  </div>
                </div>
                {isExpanded ? (
                  <div className="border-t border-gray-100">
                    {subCategories.length > 0 ? (
                      <div className="divide-y divide-gray-50">
                        {subCategories.map((sub) => {
                          const subStats = getEquipmentStats(sub.id);
                          const subIsAssetLeaf = isAssetLeafCategory(sub, state.categories);
                          return (
                            <div key={sub.id} className="px-5 py-3 hover:bg-gray-50 transition-colors ml-6">
                              <div className="flex items-center gap-3">
                                <Layers size={16} className="text-gray-400" />
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-medium text-gray-700">{sub.name}</h4>
                                  <p className="text-xs text-gray-400">{sub.description}</p>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{sub.fields.length + sub.optionalFields.length} polja</span>
                                  <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{subStats.total} kom</span>
                                </div>
                                <div className="flex gap-1">
                                  <button type="button" onClick={() => void openEdit(sub)} className="text-blue-500 hover:text-blue-700 p-1"><Edit2 size={14} /></button>
                                  <button type="button" onClick={() => void handleDelete(sub.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={14} /></button>
                                </div>
                              </div>
                              <CategoryFieldBadges fields={sub.fields} optionalFields={sub.optionalFields} />
                              {subIsAssetLeaf && maintenanceEnabled ? (
                                <CategoryMaintenanceCatalogBadges labels={labelsByHostId[sub.id] ?? []} />
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="px-5 py-8 text-center text-gray-400 text-sm">
                        Nema podkategorija.{' '}
                        <button type="button" onClick={() => openAddSub(parent.id)} className="text-blue-500 hover:underline">
                          Dodaj prvu podkategoriju
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
          {assetParentCategories.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
              Nema kategorija opreme. Dodajte prvu glavnu kategoriju.
            </div>
          ) : null}
        </div>
      ) : activeTab === 'maintenance' ? (
        <div className="space-y-4">
          {maintenanceParentCategories.map((parent) => {
            const subs = state.categories.filter((row) => row.parentId === parent.id);
            const isExpanded = expandedParentId === parent.id;
            return (
              <div key={parent.id} className="bg-white rounded-xl shadow-sm border border-amber-100 overflow-hidden">
                <div
                  className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-amber-50/50 transition-colors bg-gradient-to-r from-amber-50 to-transparent"
                  onClick={() => setExpandedParentId(isExpanded ? null : parent.id)}
                >
                  {isExpanded ? <FolderOpen size={20} className="text-amber-600" /> : <Wrench size={20} className="text-amber-500" />}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-800">{parent.name}</h3>
                    <p className="text-xs text-gray-500">{parent.description || 'Grupa dijelova za održavanje'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full">{subs.length} tipova</span>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => openAddSub(parent.id, 'MAINTENANCE')} className="text-green-600 hover:text-green-800 p-1" title="Dodaj tip dijela">
                        <Plus size={14} />
                      </button>
                      <button type="button" onClick={() => void openEdit(parent)} className="text-amber-600 hover:text-amber-800 p-1"><Edit2 size={14} /></button>
                      <button type="button" onClick={() => void handleDelete(parent.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={14} /></button>
                    </div>
                    {isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                  </div>
                </div>
                {isExpanded ? (
                  <div className="border-t border-amber-50">
                    {subs.length > 0 ? (
                      <div className="divide-y divide-gray-50">
                        {subs.map((sub) => (
                          <div key={sub.id} className="px-5 py-3 hover:bg-amber-50/30 transition-colors ml-6">
                            <div className="flex items-center gap-3">
                              <Layers size={16} className="text-amber-400" />
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-gray-700">{sub.name}</h4>
                                <p className="text-xs text-gray-400">{sub.description}</p>
                              </div>
                              <div className="flex gap-1">
                                <button type="button" onClick={() => void openEdit(sub)} className="text-amber-600 hover:text-amber-800 p-1"><Edit2 size={14} /></button>
                                <button type="button" onClick={() => void handleDelete(sub.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={14} /></button>
                              </div>
                            </div>
                            <CategoryFieldBadges fields={sub.fields} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="px-5 py-8 text-center text-gray-400 text-sm">
                        Nema tipova dijelova.{' '}
                        <button type="button" onClick={() => openAddSub(parent.id, 'MAINTENANCE')} className="text-amber-600 hover:underline">
                          Dodaj prvi tip
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
          {maintenanceParentCategories.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-amber-100 p-12 text-center text-gray-400">
              Nema kategorija održavanja. Dodajte prvu grupu (npr. Računarski dijelovi, Toneri).
            </div>
          ) : null}
        </div>
      ) : null}
      {isAssetSubcategoryForm ? (
        <CategoryAssetSubcategoryDialog
          key={editing?.id ?? `draft-${fParentId ?? 'new'}`}
          title={formTitle}
          name={fName}
          description={fDesc}
          parentId={fParentId}
          parentOptions={assetParentCategories}
          fields={fFields}
          optionalFields={fOptFields}
          linkedMaintenanceIds={fLinkedMaintenanceIds}
          allCategories={state.categories}
          linksLoading={linksLoading}
          saving={saving}
          showCatalogTab={Boolean(showMaintenanceLinksInForm)}
          onNameChange={setFName}
          onDescriptionChange={setFDesc}
          onParentIdChange={setFParentId}
          onFieldsChange={setFFields}
          onOptionalFieldsChange={setFOptFields}
          onLinkedMaintenanceIdsChange={setFLinkedMaintenanceIds}
          onClose={() => setShowForm(false)}
          onSave={() => void handleSave()}
        />
      ) : null}
      {showForm && !isAssetSubcategoryForm ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold">{formTitle}</h2>
              <p className="text-xs text-gray-500 mt-1">
                {fCategoryKind === 'MAINTENANCE' ? 'Kategorija održavanja — dijelovi i potrošni materijal' : 'Kategorija opreme — grupiranje podkategorija'}
              </p>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className={labelClass}>Naziv *</label>
                <input
                  type="text"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  className={inputClass}
                  placeholder={fCategoryKind === 'MAINTENANCE' ? 'Npr. SSD ili Računarski dijelovi' : 'Npr. Računarska oprema'}
                />
              </div>
              <div>
                <label className={labelClass}>Opis</label>
                <textarea
                  value={fDesc}
                  onChange={(e) => setFDesc(e.target.value)}
                  className={inputClass}
                  rows={2}
                  placeholder="Opis kategorije..."
                />
              </div>
              {(fParentId || (!editing && formParentOptions.length > 0 && isFormSubCategory)) ? (
                <div>
                  <label className={labelClass}>Glavna kategorija</label>
                  <select
                    value={fParentId || ''}
                    onChange={(e) => setFParentId(e.target.value || null)}
                    className={inputClass}
                  >
                    <option value="">— Bez glavne kategorije (ovo je glavna kategorija) —</option>
                    {formParentOptions.filter((p) => p.id !== editing?.id).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              {isFormSubCategory && fCategoryKind === 'MAINTENANCE' ? (
                <CategoryFieldEditor fields={fFields} onChange={setFFields} label="Polja specifikacije (opcionalno)" />
              ) : null}
              {!isFormSubCategory ? (
                <div className={`rounded-lg p-4 text-sm ${fCategoryKind === 'MAINTENANCE' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-700'}`}>
                  <Settings size={16} className="inline mr-2" />
                  {fCategoryKind === 'MAINTENANCE'
                    ? 'Glavne grupe održavanja služe za grupiranje tipova dijelova (SSD, toner, …).'
                    : 'Glavne kategorije opreme služe za grupiranje podkategorija. Polja specifikacije definiraju se na podkategoriji.'}
                </div>
              ) : null}
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-300 hover:bg-gray-50">Odustani</button>
              <button type="button" disabled={saving} onClick={() => void handleSave()} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
                {saving ? 'Čuvanje...' : (editing ? 'Sačuvaj' : 'Dodaj')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
