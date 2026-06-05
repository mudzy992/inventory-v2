import { useCallback, useEffect, useState } from 'react';
import {
  fetchLinkedHostCategoriesApi,
  fetchMaintenanceConsumptionSummaryApi,
  type LinkedHostCategoryDto,
  type MaintenanceConsumptionRowDto,
} from '../../api/maintenance-parts-api';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';

interface WarehouseMaintenanceConsumptionPanelProps {
  warehouseId: string;
}

export const WarehouseMaintenanceConsumptionPanel = ({
  warehouseId,
}: WarehouseMaintenanceConsumptionPanelProps) => {
  const { toastError } = useToast();
  const [rows, setRows] = useState<MaintenanceConsumptionRowDto[]>([]);
  const [hostCategories, setHostCategories] = useState<LinkedHostCategoryDto[]>([]);
  const [hostCategoryId, setHostCategoryId] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const loadHosts = async () => {
      try {
        const hosts = await fetchLinkedHostCategoriesApi();
        setHostCategories(hosts);
      } catch {
        setHostCategories([]);
      }
    };
    void loadHosts();
  }, []);
  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const summary = await fetchMaintenanceConsumptionSummaryApi(
        warehouseId,
        hostCategoryId || undefined,
      );
      setRows(summary);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri učitavanju potrošnje');
    } finally {
      setLoading(false);
    }
  }, [hostCategoryId, toastError, warehouseId]);
  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);
  return (
    <div className="rounded-xl border border-gray-200 p-4 space-y-3 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Potrošnja po tipu opreme</h3>
          <p className="text-xs text-gray-500">Ugrađene količine s ovog skladišta (lot MAINTENANCE).</p>
        </div>
        <div className="min-w-[200px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">Kategorija opreme (host)</label>
          <select
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
            value={hostCategoryId}
            onChange={(e) => setHostCategoryId(e.target.value)}
          >
            <option value="">Sve</option>
            {hostCategories.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {loading ? (
        <p className="text-xs text-gray-500">Učitavanje...</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-500">Nema evidentirane potrošnje.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2">Dio</th>
                <th className="px-3 py-2">Kategorija opreme</th>
                <th className="px-3 py-2">Aktivno</th>
                <th className="px-3 py-2">U kvaru</th>
                <th className="px-3 py-2">Uklonjeno</th>
                <th className="px-3 py-2">Ukupno ugrađeno</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={`${row.maintenanceCategoryId}-${row.hostCategoryId ?? 'all'}`}>
                  <td className="px-3 py-2 font-medium text-gray-800">{row.maintenanceCategoryName}</td>
                  <td className="px-3 py-2 text-gray-600">{row.hostCategoryName ?? '—'}</td>
                  <td className="px-3 py-2">{row.activeQuantity}</td>
                  <td className="px-3 py-2">{row.faultyQuantity}</td>
                  <td className="px-3 py-2">{row.removedQuantity}</td>
                  <td className="px-3 py-2">{row.installedTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
