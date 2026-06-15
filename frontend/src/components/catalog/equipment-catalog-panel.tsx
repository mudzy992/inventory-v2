import { useCallback } from 'react';
import {
  createCatalogItemApi,
  deleteCatalogItemApi,
  searchCatalogItemsApi,
  type EquipmentCatalogItem,
} from '../../api/equipment-catalog-api';
import { ApiError } from '../../api/client';
import { getApiErrorMessage, refreshAfterMutation } from '../../helpers/run-mutation-with-refresh.util';
import { useToast } from '../../contexts/toast-context';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { getAssetLeafCategories } from '../../helpers/warehouse-stock.util';
import { useStore } from '../../useStore';
import { Button } from '../ui/button';
import { inputClass, labelClass, selectClass } from '../ui/form-styles';
import { PaginationControls } from '../ui/pagination-controls';
import { ModalRoot } from '../ui/modal-root';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

export const EquipmentCatalogPanel = () => {
  const [state] = useStore();
  const { toastError, toastSuccess } = useToast();
  const leafCategories = getAssetLeafCategories(state.categories);
  const [showDialog, setShowDialog] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchPage = useCallback(
    (params: { categoryId?: string; page?: number; pageSize?: number; search?: string }) =>
      searchCatalogItemsApi(params),
    [],
  );

  const list = usePaginatedList<EquipmentCatalogItem, { categoryId?: string }>({
    fetchPage,
    initialFilters: { categoryId: undefined },
  });

  const loadItems = list.refresh;

  const openDialog = () => {
    setCode('');
    setName('');
    setCategoryId('');
    setShowDialog(true);
  };

  const handleCreate = async () => {
    if (!code.trim() || !name.trim() || !categoryId) {
      return;
    }
    setSaving(true);
    try {
      await createCatalogItemApi({
        code: code.trim(),
        name: name.trim(),
        categoryId,
      });
      toastSuccess('Stavka šifrarnika dodana');
      setShowDialog(false);
      await loadItems();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri spremanju');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Obrisati stavku šifrarnika?')) {
      return;
    }
    try {
      await deleteCatalogItemApi(id);
      toastSuccess('Stavka obrisana');
      await refreshAfterMutation([loadItems]);
    } catch (err) {
      toastError(getApiErrorMessage(err, 'Greška pri brisanju'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="flex flex-wrap gap-3 flex-1">
          <div className="min-w-[200px]">
            <label className={labelClass}>Filter kategorije</label>
            <select
              value={list.filters.categoryId ?? ''}
              onChange={(e) =>
                list.setFilters({ categoryId: e.target.value || undefined })
              }
              className={selectClass}
            >
              <option value="">Sve kategorije</option>
              {leafCategories.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[200px] flex-1">
            <label className={labelClass}>Pretraga</label>
            <input
              type="text"
              value={list.search}
              onChange={(e) => list.setSearch(e.target.value)}
              className={inputClass}
              placeholder="Šifra ili naziv…"
            />
          </div>
        </div>
        <Button onClick={openDialog}>
          <Plus size={14} />
          Nova stavka
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2">Šifra</th>
              <th className="text-left px-4 py-2">Naziv</th>
              <th className="text-left px-4 py-2">Kategorija</th>
              <th className="text-right px-4 py-2">Akcije</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  Učitavanje…
                </td>
              </tr>
            ) : null}
            {!list.isLoading &&
              list.items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-2 font-mono text-xs">{item.code}</td>
                  <td className="px-4 py-2">{item.name}</td>
                  <td className="px-4 py-2">{item.category?.name ?? '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      className="text-red-600 hover:text-red-800"
                      onClick={() => void handleDelete(item.id)}
                      aria-label="Obriši"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            {!list.isLoading && list.items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  Nema stavki u šifrarniku.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {list.meta ? (
          <PaginationControls
            page={list.meta.page}
            pageSize={list.meta.pageSize}
            total={list.meta.total}
            totalPages={list.meta.totalPages}
            onPageChange={list.setPage}
            onPageSizeChange={list.setPageSize}
          />
        ) : null}
      </div>

      {showDialog ? (
        <ModalRoot open onClose={() => setShowDialog(false)} size="lg" panelClassName="bg-white shadow-xl max-w-lg">
          <div className="bg-white rounded-xl w-full">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Nova stavka šifrarnika</h2>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className={labelClass}>Kategorija *</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className={selectClass}
                >
                  <option value="">— Odaberi —</option>
                  {leafCategories.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Šifra *</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Naziv *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowDialog(false)}>
                Odustani
              </Button>
              <Button disabled={saving} onClick={() => void handleCreate()}>
                Sačuvaj
              </Button>
            </div>
          </div>
        </ModalRoot>
      ) : null}
    </div>
  );
};
