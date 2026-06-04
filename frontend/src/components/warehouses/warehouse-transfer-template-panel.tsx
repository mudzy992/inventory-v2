import { useCallback, useEffect, useState } from 'react';
import { FileUp } from 'lucide-react';
import {
  activateWarehouseTransferTemplateApi,
  downloadWarehouseTransferTemplateApi,
  fetchWarehouseTransferTemplatesApi,
  uploadWarehouseTransferTemplateApi,
  type WarehouseTransferTemplateMeta,
} from '../../api/warehouse-transfer-template-api';
import { formatDate } from '../../helpers';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { Button } from '../ui/button';
import { inputClass, labelClass } from '../ui/form-styles';

const PLACEHOLDERS = [
  '{broj_prenosnice}',
  '{predao}',
  '{preuzeo}',
  '{potpisnik}',
  '{inv_broj}',
  '{naziv_opreme}',
  '{obrazlozenje}',
];

interface WarehouseTransferTemplatePanelProps {
  warehouseId: string;
  hasOrgUnit: boolean;
  embedded?: boolean;
}

export const WarehouseTransferTemplatePanel = ({
  warehouseId,
  hasOrgUnit,
  embedded = false,
}: WarehouseTransferTemplatePanelProps) => {
  const { toastError, toastSuccess } = useToast();
  const [templates, setTemplates] = useState<WarehouseTransferTemplateMeta[]>([]);
  const [label, setLabel] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await fetchWarehouseTransferTemplatesApi(warehouseId);
      setTemplates(Array.isArray(rows) ? rows : []);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri učitavanju obrazaca');
    } finally {
      setIsLoading(false);
    }
  }, [warehouseId, toastError]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpload = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    if (!file.name.toLowerCase().endsWith('.docx')) {
      toastError('Obrazac mora biti .docx datoteka');
      return;
    }
    if (!hasOrgUnit) {
      toastError('Dodijelite org. jedinicu skladištu prije uploada obrasca');
      return;
    }
    try {
      await uploadWarehouseTransferTemplateApi(warehouseId, file, label);
      toastSuccess('Obrazac prenosnice uploadovan');
      setLabel('');
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Upload nije uspio');
    }
  };

  const handleDownload = async (row: WarehouseTransferTemplateMeta) => {
    try {
      await downloadWarehouseTransferTemplateApi(warehouseId, row.id, row.label);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Preuzimanje nije uspjelo');
    }
  };

  const handleActivate = async (templateId: string) => {
    try {
      await activateWarehouseTransferTemplateApi(warehouseId, templateId);
      toastSuccess('Obrazac aktiviran');
      await load();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Aktivacija nije uspjela');
    }
  };

  const activeTemplates = templates.filter((row) => row.isActive);
  const archivedTemplates = templates.filter((row) => !row.isActive);
  const rootClass = embedded ? 'space-y-4' : 'rounded-lg border border-gray-200 bg-white p-4 space-y-4';

  return (
    <div className={rootClass}>
      <div>
        {!embedded ? (
          <h3 className="text-sm font-semibold text-gray-900">Obrazac prenosnice (.docx)</h3>
        ) : null}
        <p className="text-xs text-gray-500 mt-1">
          U Word dokumentu koristite tačno ova polja (find/replace):
        </p>
        <ul className="mt-2 flex flex-wrap gap-1">
          {PLACEHOLDERS.map((token) => (
            <li
              key={token}
              className="text-[11px] font-mono bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded"
            >
              {token}
            </li>
          ))}
        </ul>
      </div>
      {!hasOrgUnit ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Skladište mora imati org. jedinicu prije uploada obrasca.
        </p>
      ) : null}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1">
          <label className={labelClass} htmlFor="template-label">
            Naziv verzije
          </label>
          <input
            id="template-label"
            className={inputClass}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="npr. Službeni obrazac 2026"
          />
        </div>
        <div>
          <input
            id={`template-upload-${warehouseId}`}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={(e) => {
              void handleUpload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <label
            htmlFor={`template-upload-${warehouseId}`}
            className="inline-flex items-center gap-2 cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <FileUp size={16} />
            Upload .docx
          </label>
        </div>
      </div>
      {isLoading ? (
        <p className="text-xs text-gray-500">Učitavam…</p>
      ) : templates.length === 0 ? (
        <p className="text-xs text-gray-500">Nema uploadovanih obrazaca.</p>
      ) : (
        <div className="space-y-4">
          {activeTemplates.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600">Aktivna verzija</p>
              <ul className="space-y-2">
                {activeTemplates.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm border border-green-200 bg-green-50/50 rounded px-2 py-1.5"
                  >
                    <span>
                      {row.label}
                      <span className="ml-2 text-xs text-green-700 font-medium">Aktivan</span>
                      <span className="block text-[11px] text-gray-500">
                        {formatDate(row.createdAt)}
                        {row.uploadedBy?.username ? ` · ${row.uploadedBy.username}` : ''}
                      </span>
                    </span>
                    <Button
                      variant="secondary"
                      type="button"
                      className="text-xs py-1 px-2"
                      onClick={() => void handleDownload(row)}
                    >
                      Preuzmi
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {archivedTemplates.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600">Arhiva</p>
              <ul className="space-y-2">
                {archivedTemplates.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm border border-gray-100 rounded px-2 py-1.5"
                  >
                    <span>
                      {row.label}
                      <span className="block text-[11px] text-gray-500">
                        {formatDate(row.createdAt)}
                        {row.uploadedBy?.username ? ` · ${row.uploadedBy.username}` : ''}
                      </span>
                    </span>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="secondary"
                        type="button"
                        className="text-xs py-1 px-2"
                        onClick={() => void handleDownload(row)}
                      >
                        Preuzmi
                      </Button>
                      <Button
                        variant="secondary"
                        type="button"
                        className="text-xs py-1 px-2"
                        onClick={() => void handleActivate(row.id)}
                      >
                        Aktiviraj
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
