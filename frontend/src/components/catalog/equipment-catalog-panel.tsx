import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  createCatalogItemApi,
  deleteCatalogItemApi,
  searchCatalogItemsApi,
  type EquipmentCatalogItem,
} from '../../api/equipment-catalog-api';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { getAssetLeafCategories } from '../../helpers/warehouse-stock.util';
import { useStore } from '../../useStore';
import { Button } from '../ui/button';
import { inputClass, labelClass, selectClass } from '../ui/form-styles';

export const EquipmentCatalogPanel = () => {
  const [state] = useStore();
  const { toastError, toastSuccess } = useToast();
  const leafCategories = getAssetLeafCategories(state.categories);
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [items, setItems] = useState<EquipmentCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [saving, setSaving] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await searchCatalogItemsApi({
        categoryId: filterCategoryId || undefined,
      });
      setItems(rows);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri učitavanju šifrarnika');
    } finally {
      setLoading(false);
    }
  }, [filterCategoryId, toastError]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

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
      await loadItems();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri brisanju');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="min-w-[200px]">
          <label className={labelClass}>Filter kategorije</label>
          <select
            value={filterCategoryId}
            onChange={(e) => setFilterCategoryId(e.target.value)}
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
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  Učitavanje…
                </td>
              </tr>
            ) : null}
            {!loading &&
              items.map((item) => (
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
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  Nema stavki u šifrarniku.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {showDialog ? (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setShowDialog(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
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
        </div>
      ) : null}
    </div>
  );
};
