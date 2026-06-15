import { useCallback, useEffect, useState } from 'react';
import { Wrench, X } from 'lucide-react';
import {
  fetchAvailableMaintenanceLotsApi,
  fetchCategoryMaintenanceLinksApi,
  fetchInstalledPartsApi,
  installMaintenancePartApi,
  markInstalledPartFaultyApi,
  removeInstalledPartApi,
  replaceInstalledPartApi,
  type InstalledPartDto,
  type MaintenanceStockLotDto,
} from '../../api/maintenance-parts-api';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { usePublicSettings } from '../../contexts/public-settings-context';
import { formatDate } from '../../helpers';
import { buildLegacySpecsPayload } from '../../helpers/category-lot-spec-fields.util';
import { expandLinkedMaintenanceToLeaves } from '../../helpers/expand-maintenance-catalog.util';
import { isAdmin, isEvidenticar } from '../../store';
import type { Category, EquipmentStatus } from '../../types';
import { CategoryLotSpecFields } from './category-lot-spec-fields';
import { Button } from '../ui/button';
import { inputClass, labelClass, selectClass } from '../ui/form-styles';

interface EquipmentInstalledPartsPanelProps {
  equipmentId: string;
  equipmentCategoryId: string;
  equipmentStatus: EquipmentStatus;
  categories: Category[];
}

const statusLabel: Record<InstalledPartDto['status'], string> = {
  active: 'Aktivan',
  faulty: 'U kvaru',
  removed: 'Uklonjen',
};

export const EquipmentInstalledPartsPanel = ({
  equipmentId,
  equipmentCategoryId,
  equipmentStatus,
  categories,
}: EquipmentInstalledPartsPanelProps) => {
  const { getBoolean } = usePublicSettings();
  const maintenanceEnabled = getBoolean('features.maintenance_parts', true);
  const partsReadOnly = equipmentStatus === 'za_rashod';
  const canManage = (isAdmin() || isEvidenticar()) && !partsReadOnly;
  const { toastError, toastSuccess } = useToast();
  const [parts, setParts] = useState<InstalledPartDto[]>([]);
  const [linkedCategories, setLinkedCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [installCategoryId, setInstallCategoryId] = useState('');
  const [availableLots, setAvailableLots] = useState<MaintenanceStockLotDto[]>([]);
  const [selectedLotId, setSelectedLotId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [replacePartId, setReplacePartId] = useState<string | null>(null);
  const [legacySpecValues, setLegacySpecValues] = useState<Record<string, string>>({});
  const [hostCategoryId, setHostCategoryId] = useState<string | null>(null);
  const installCategory = categories.find((row) => row.id === installCategoryId);
  const installLotSpecFields = installCategory ? installCategory.optionalFields : [];
  const loadParts = useCallback(async () => {
    if (!maintenanceEnabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchInstalledPartsApi(equipmentId);
      setParts(rows);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri učitavanju dijelova');
    } finally {
      setLoading(false);
    }
  }, [equipmentId, maintenanceEnabled, toastError]);
  useEffect(() => {
    void loadParts();
  }, [loadParts]);
  useEffect(() => {
    if (!maintenanceEnabled || !canManage) {
      setHostCategoryId(null);
      setLinkedCategories([]);
      return;
    }
    const loadCatalog = async () => {
      try {
        const links = await fetchCategoryMaintenanceLinksApi(equipmentCategoryId);
        if (links.length === 0) {
          setHostCategoryId(null);
          setLinkedCategories([]);
          return;
        }
        const linkedIds = links.map((row) => row.maintenanceCategory.id);
        const leaves = expandLinkedMaintenanceToLeaves(linkedIds, categories);
        setHostCategoryId(equipmentCategoryId);
        setLinkedCategories(leaves.map((row) => ({ id: row.id, name: row.name })));
      } catch (err) {
        toastError(err instanceof ApiError ? err.message : 'Greška pri učitavanju kataloga');
        setHostCategoryId(null);
        setLinkedCategories([]);
      }
    };
    void loadCatalog();
  }, [canManage, categories, equipmentCategoryId, maintenanceEnabled, toastError]);
  useEffect(() => {
    if (!installCategoryId || !canManage) {
      setAvailableLots([]);
      return;
    }
    const loadLots = async () => {
      try {
        const lots = await fetchAvailableMaintenanceLotsApi(equipmentId, installCategoryId);
        setAvailableLots(lots);
        setSelectedLotId(lots[0]?.id ?? '');
      } catch (err) {
        toastError(err instanceof ApiError ? err.message : 'Greška pri učitavanju lotova');
      }
    };
    void loadLots();
  }, [canManage, equipmentId, installCategoryId, toastError]);
  const handleInstall = async () => {
    if (!selectedLotId) {
      return;
    }
    const qty = Number.parseInt(quantity, 10);
    if (Number.isNaN(qty) || qty < 1) {
      return;
    }
    try {
      const legacySpecs = buildLegacySpecsPayload(installLotSpecFields, legacySpecValues);
      const specsPayload =
        Object.keys(legacySpecs).length > 0 ? { legacySpecs } : {};
      if (replacePartId) {
        await replaceInstalledPartApi(replacePartId, {
          stockLotId: selectedLotId,
          quantity: qty,
          ...specsPayload,
        });
        toastSuccess('Dio zamijenjen');
        setReplacePartId(null);
      } else {
        await installMaintenancePartApi(equipmentId, {
          stockLotId: selectedLotId,
          quantity: qty,
          ...specsPayload,
        });
        toastSuccess('Dio ugrađen');
      }
      setInstallCategoryId('');
      setSelectedLotId('');
      setQuantity('1');
      setLegacySpecValues({});
      await loadParts();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
  };
  const handleFaulty = async (partId: string) => {
    try {
      await markInstalledPartFaultyApi(partId);
      toastSuccess('Označeno kao u kvaru');
      await loadParts();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
  };
  const handleRemove = async (partId: string) => {
    try {
      await removeInstalledPartApi(partId);
      toastSuccess('Dio uklonjen');
      await loadParts();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
  };
  const handleCancelReplace = () => {
    setReplacePartId(null);
    setInstallCategoryId('');
    setSelectedLotId('');
    setQuantity('1');
    setLegacySpecValues({});
  };
  const actionForm = (
    <>
      <div>
        <label className={labelClass}>Tip dijela</label>
        <select
          className={selectClass}
          value={installCategoryId}
          onChange={(e) => {
            setInstallCategoryId(e.target.value);
            setLegacySpecValues({});
          }}
        >
          <option value="">— Odaberi —</option>
          {linkedCategories.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </div>
      {installCategoryId ? (
        <>
          <div>
            <label className={labelClass}>Lot sa skladišta</label>
            <select
              className={selectClass}
              value={selectedLotId}
              onChange={(e) => setSelectedLotId(e.target.value)}
            >
              {availableLots.length === 0 ? (
                <option value="">Nema dostupnih lotova</option>
              ) : (
                availableLots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.productName} ({lot.warehouse?.name}) — {lot.quantityOnHand} kom
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className={labelClass}>Količina</label>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <CategoryLotSpecFields
            category={installCategory}
            values={legacySpecValues}
            onChange={(fieldId, value) =>
              setLegacySpecValues((prev) => ({ ...prev, [fieldId]: value }))
            }
          />
          <div className="flex gap-2">
            <Button disabled={!selectedLotId} onClick={() => void handleInstall()}>
              {replacePartId ? 'Potvrdi zamjenu' : 'Ugradi'}
            </Button>
            {replacePartId ? (
              <Button variant="secondary" onClick={handleCancelReplace}>
                Odustani
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
  if (!maintenanceEnabled) {
    return null;
  }
  if (!canManage && !loading && parts.length === 0) {
    return null;
  }
  if (canManage && (!hostCategoryId || linkedCategories.length === 0) && !loading && parts.length === 0) {
    return null;
  }
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <Wrench size={16} /> Ugrađeni dijelovi (održavanje)
      </h3>
      {partsReadOnly ? (
        <p className="text-xs text-orange-700 mb-3">
          Oprema je na listi za rashod — ugradnja i izmjena dijelova nije moguća.
        </p>
      ) : null}
      {loading ? (
        <p className="text-xs text-gray-500">Učitavanje...</p>
      ) : parts.length === 0 ? (
        <p className="text-xs text-gray-500 mb-3">Nema evidentiranih ugrađenih dijelova.</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {parts.map((part) => (
            <li key={part.id} className="bg-white border border-gray-100 rounded-lg px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-gray-800">
                  {part.maintenanceCategory?.name ?? 'Dio'} × {part.quantity}
                </span>
                <span className="text-xs text-gray-500">{statusLabel[part.status]}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {part.stockLot?.productName ?? '—'} · {formatDate(part.installedAt)}
              </p>
              {canManage && part.status !== 'removed' ? (
                <div className="flex flex-wrap gap-2 mt-2">
                  {part.status === 'active' ? (
                    <>
                      <button
                        type="button"
                        className="text-xs text-amber-700 underline"
                        onClick={() => void handleFaulty(part.id)}
                      >
                        Kvar
                      </button>
                      <button
                        type="button"
                        className="text-xs text-blue-700 underline"
                        onClick={() => {
                          setReplacePartId(part.id);
                          setInstallCategoryId(part.maintenanceCategoryId);
                        }}
                      >
                        Zamijeni
                      </button>
                    </>
                  ) : null}
                  {part.status === 'faulty' ? (
                    <button
                      type="button"
                      className="text-xs text-blue-700 underline"
                      onClick={() => {
                        setReplacePartId(part.id);
                        setInstallCategoryId(part.maintenanceCategoryId);
                      }}
                    >
                      Zamijeni
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-xs text-gray-600 underline"
                    onClick={() => void handleRemove(part.id)}
                  >
                    Ukloni
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <div
          className={`border-t border-gray-200 pt-3 space-y-2 ${replacePartId ? 'hidden md:block' : ''}`}
        >
          <p className="text-xs font-medium text-gray-600">
            {replacePartId ? 'Zamjena dijela' : 'Ugradnja novog dijela'}
          </p>
          {actionForm}
        </div>
      ) : null}
      {canManage && replacePartId ? (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Zatvori zamjenu dijela"
            onClick={handleCancelReplace}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl shadow-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900">Zamjena dijela</h3>
              <button
                type="button"
                onClick={handleCancelReplace}
                className="p-2 rounded-lg hover:bg-gray-100"
                aria-label="Zatvori"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2">{actionForm}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
