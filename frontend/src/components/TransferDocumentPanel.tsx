import { useEffect, useState } from 'react';
import { Download, Eye, FileText, Upload } from 'lucide-react';
import type { InventorySessionStatus } from '../api/inventory-api';
import { fetchAuthenticatedBlob, getApiBaseUrl } from '../api/client';
import { apiRequest } from '../api/client';
import { uploadTransferDocumentApi } from '../api/data-api';
import type { TransferRecord } from '../types';
import {
  buildInventoryTransferSteps,
  getInventoryTransferBadge,
} from './inventory-count/inventory-transfer-step.util';
import { buildTransferSteps, getTransferStepBadge } from './transfers/transfer-step.util';
import { cn } from '../utils/cn';

interface UploadMeta {
  id: string;
  mime: string;
  path: string;
}

interface TransferDocumentPanelProps {
  transfer: TransferRecord;
  onSigned?: () => void;
  allowSign?: boolean;
  inventoryMode?: boolean;
  inventorySessionStatus?: InventorySessionStatus;
  linePendingApplied?: boolean;
}

export const TransferDocumentPanel = ({
  transfer,
  onSigned,
  allowSign = false,
  inventoryMode = false,
  inventorySessionStatus = 'active',
  linePendingApplied = false,
}: TransferDocumentPanelProps) => {
  const [uploadMeta, setUploadMeta] = useState<UploadMeta | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inventorySteps = inventoryMode
    ? buildInventoryTransferSteps(transfer, inventorySessionStatus, linePendingApplied)
    : null;
  const standardSteps = !inventoryMode ? buildTransferSteps(transfer) : null;
  const inventoryBadge = inventoryMode
    ? getInventoryTransferBadge(transfer, inventorySessionStatus, linePendingApplied)
    : null;
  const standardBadge = !inventoryMode ? getTransferStepBadge(transfer) : null;
  const finalizeBlocked =
    inventoryMode && inventorySessionStatus === 'active' && transfer.status !== 'potpisan';
  useEffect(() => {
    const load = async () => {
      if (!transfer.scannedDocUrl) {
        setUploadMeta(null);
        return;
      }
      try {
        const uploads = await apiRequest<UploadMeta[]>(
          `/uploads?entityType=transfer&entityId=${transfer.id}`,
        ).catch(() => []);
        const first = Array.isArray(uploads) ? uploads[0] : null;
        if (first) {
          setUploadMeta(first);
        }
      } catch {
        setUploadMeta(null);
      }
    };
    void load();
  }, [transfer.id, transfer.scannedDocUrl]);
  const handlePreview = async () => {
    if (!uploadMeta) {
      return;
    }
    setIsLoading(true);
    try {
      const blob = await fetchAuthenticatedBlob(`/uploads/${uploadMeta.id}`);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } finally {
      setIsLoading(false);
    }
  };
  const handleDownload = async () => {
    if (!uploadMeta) {
      return;
    }
    const blob = await fetchAuthenticatedBlob(`/uploads/${uploadMeta.id}`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = transfer.documentNumber;
    link.click();
    URL.revokeObjectURL(url);
  };
  const handleDownloadRaw = async () => {
    setIsLoading(true);
    try {
      const blob = await fetchAuthenticatedBlob(`/transfers/${transfer.id}/raw-document`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${transfer.documentNumber}-raw.html`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsLoading(false);
    }
  };
  const handleUpload = async (file: File) => {
    await uploadTransferDocumentApi(transfer.id, file);
    onSigned?.();
  };
  const isRaw = transfer.status === 'raw' || transfer.status === 'printed';
  const canUpload = allowSign && isRaw && !transfer.scannedDocUrl;
  const badgeClass =
    inventoryBadge?.tone === 'success'
      ? 'bg-green-100 text-green-800'
      : inventoryBadge?.tone === 'info'
        ? 'bg-blue-100 text-blue-800'
        : 'bg-amber-100 text-amber-800';
  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
          <FileText size={16} />
          Prenosnica {transfer.documentNumber}
        </div>
        {inventoryMode && inventoryBadge ? (
          <span className={cn('text-xs px-2 py-0.5 rounded-full', badgeClass)}>{inventoryBadge.label}</span>
        ) : standardBadge ? (
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full',
              standardBadge.tone === 'success'
                ? 'bg-green-100 text-green-800'
                : standardBadge.tone === 'info'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-amber-100 text-amber-800',
            )}
          >
            {standardBadge.label}
          </span>
        ) : (
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full',
              isRaw ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800',
            )}
          >
            {isRaw ? 'RAW' : 'Potpisana'}
          </span>
        )}
      </div>
      {inventoryMode && inventorySteps ? (
        <ol className="flex flex-wrap gap-1 sm:gap-2" aria-label="Koraci prenosnice u popisu">
          {inventorySteps.map((step) => (
            <li
              key={step.id}
              className={cn(
                'text-[10px] sm:text-xs px-2 py-1 rounded-full border',
                step.isCurrent
                  ? 'bg-blue-600 text-white border-blue-600'
                  : step.isComplete
                    ? 'bg-green-50 text-green-800 border-green-200'
                    : 'bg-white text-gray-500 border-gray-200',
              )}
            >
              {step.label}
            </li>
          ))}
        </ol>
      ) : null}
      {!inventoryMode && standardSteps ? (
        <ol className="flex flex-wrap gap-1 sm:gap-2" aria-label="Koraci prenosnice">
          {standardSteps.map((step) => (
            <li
              key={step.id}
              className={cn(
                'text-[10px] sm:text-xs px-2 py-1 rounded-full border',
                step.isCurrent
                  ? 'bg-blue-600 text-white border-blue-600'
                  : step.isComplete
                    ? 'bg-green-50 text-green-800 border-green-200'
                    : 'bg-white text-gray-500 border-gray-200',
              )}
            >
              {step.label}
            </li>
          ))}
        </ol>
      ) : null}
      {!inventoryMode && isRaw ? (
        <p className="text-xs text-gray-500">
          Draft dokument — potpis i sken se vrše nakon odobrenja (rashod: komisija).
        </p>
      ) : null}
      {inventoryMode ? (
        <p className="text-xs text-gray-500">
          Oprema se mijenja tek nakon zatvaranja sesije popisa. Upload potpisane prenosnice tokom aktivne sesije.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {(inventoryMode || isRaw) && (
          <button
            type="button"
            onClick={() => void handleDownloadRaw()}
            disabled={isLoading}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-gray-50"
          >
            <Download size={14} /> RAW dokument
          </button>
        )}
        {uploadMeta && (
          <>
            <button
              type="button"
              onClick={() => void handlePreview()}
              disabled={isLoading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-gray-50"
            >
              <Eye size={14} /> Pregled skena
            </button>
            <button
              type="button"
              onClick={() => void handleDownload()}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-gray-50"
            >
              <Download size={14} /> Preuzmi sken
            </button>
          </>
        )}
        {canUpload && (
          <label className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700">
            <Upload size={14} /> Upload potpisane
            <input
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleUpload(file);
                }
              }}
            />
          </label>
        )}
        {!inventoryMode && allowSign && isRaw && (
          <label className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700">
            <Upload size={14} /> Upload + potpis
            <input
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleUpload(file);
                }
              }}
            />
          </label>
        )}
      </div>
      {finalizeBlocked ? (
        <p className="text-xs text-amber-800" title="Finalizacija je blokirana dok je sesija popisa aktivna">
          Finalizacija prenosnice nije dostupna dok traje godišnji popis — promjena opreme se primjenjuje pri zatvaranju
          sesije.
        </p>
      ) : null}
      {previewUrl && (
        <div className="mt-2">
          {uploadMeta?.mime.startsWith('image/') ? (
            <img src={previewUrl} alt="Sken prenosnice" className="max-h-64 rounded border" />
          ) : (
            <iframe src={previewUrl} title="Sken" className="w-full h-64 border rounded" />
          )}
          <p className="text-[10px] text-gray-400 mt-1">
            {getApiBaseUrl()}/uploads/{uploadMeta?.id}
          </p>
        </div>
      )}
    </div>
  );
};
