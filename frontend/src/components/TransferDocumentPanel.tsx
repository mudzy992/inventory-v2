import { useEffect, useState } from 'react';
import { CheckCircle, Download, Eye, FileText, Upload } from 'lucide-react';
import type { InventorySessionStatus } from '../api/inventory-api';
import { fetchAuthenticatedBlob, getApiBaseUrl } from '../api/client';
import { apiRequest } from '../api/client';
import { signTransferApi, uploadTransferDocumentApi } from '../api/data-api';
import type { TransferRecord } from '../types';
import {
  buildInventoryTransferSteps,
  getInventoryTransferBadge,
} from './inventory-count/inventory-transfer-step.util';
import { buildTransferSteps, getTransferStepBadge } from './transfers/transfer-step.util';
import { cn } from '../utils/cn';
import { useAdminSettings } from '../contexts/admin-settings-context';
import { isAdmin } from '../store';
import { useToast } from '../contexts/toast-context';
import { canFinalizeTransfer, canSignTransfer } from '../helpers/guards';
import { ApiError } from '../api/client';

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
  const { getBoolean, getNumber } = useAdminSettings();
  const { toastError } = useToast();
  const maxUploadMb = getNumber('upload.max_mb', 10);
  const allowFinalizeWithoutUpload =
    isAdmin() && getBoolean('transfer.allow_finalize_without_upload', false);
  const requireSignedPdf = getBoolean('transfer.require_signed_pdf_upload', true);
  const [uploadMeta, setUploadMeta] = useState<UploadMeta | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generatedPrintPreviewUrl, setGeneratedPrintPreviewUrl] = useState<string | null>(null);
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
    return () => {
      if (generatedPrintPreviewUrl) {
        URL.revokeObjectURL(generatedPrintPreviewUrl);
      }
    };
  }, [generatedPrintPreviewUrl]);

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
  const handlePrintPreview = async () => {
    setIsLoading(true);
    try {
      const blob = await fetchAuthenticatedBlob(
        `/transfers/${transfer.id}/generated-document?format=pdf`,
      );
      if (generatedPrintPreviewUrl) {
        URL.revokeObjectURL(generatedPrintPreviewUrl);
      }
      setGeneratedPrintPreviewUrl(URL.createObjectURL(blob));
    } catch {
      toastError(
        'PDF nije generisan (provjerite postavku generate_print_pdf i LibreOffice na serveru). Preuzmite DOCX.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadGenerated = async (format: 'docx' | 'pdf') => {
    setIsLoading(true);
    try {
      const blob = await fetchAuthenticatedBlob(
        `/transfers/${transfer.id}/generated-document?format=${format}`,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${transfer.documentNumber}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      await handleDownloadRaw();
    } finally {
      setIsLoading(false);
    }
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
    if (file.type !== 'application/pdf') {
      toastError('Potpisana prenosnica mora biti PDF');
      return;
    }
    const maxBytes = maxUploadMb * 1024 * 1024;
    if (file.size > maxBytes) {
      toastError(`Datoteka prelazi limit od ${maxUploadMb} MB`);
      return;
    }
    await uploadTransferDocumentApi(transfer.id, file);
    onSigned?.();
  };
  const handleFinalize = async () => {
    const finalizeGuard = canFinalizeTransfer(transfer.status);
    if (!finalizeGuard.allowed) {
      toastError(finalizeGuard.reason ?? 'Finalizacija nije dozvoljena.');
      return;
    }
    const signGuard = canSignTransfer({
      hasUploadedPdf: Boolean(transfer.scannedDocUrl),
      requireSignedUpload: requireSignedPdf,
      allowFinalizeWithoutUpload,
    });
    if (!signGuard.allowed) {
      toastError(signGuard.reason ?? 'Finalizacija nije dozvoljena.');
      return;
    }
    setIsLoading(true);
    try {
      await signTransferApi(transfer.id, {});
      onSigned?.();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška pri finalizaciji';
      toastError(message);
    } finally {
      setIsLoading(false);
    }
  };
  const isRaw = transfer.status === 'raw' || transfer.status === 'printed';
  const isAwaitingFinalize = transfer.status === 'uploaded' || transfer.status === 'printed';
  const canPrintPreview =
    !inventoryMode &&
    (transfer.status === 'raw' ||
      transfer.status === 'printed' ||
      transfer.status === 'uploaded');
  const canUpload =
    allowSign &&
    !inventoryMode &&
    transfer.status !== 'potpisan' &&
    transfer.status !== 'cancelled';
  const canFinalize =
    allowSign &&
    !inventoryMode &&
    !finalizeBlocked &&
    canFinalizeTransfer(transfer.status).allowed &&
    canSignTransfer({
      hasUploadedPdf: Boolean(transfer.scannedDocUrl),
      requireSignedUpload: requireSignedPdf,
      allowFinalizeWithoutUpload,
    }).allowed &&
    (Boolean(transfer.scannedDocUrl) || allowFinalizeWithoutUpload);
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
              isRaw
                ? 'bg-amber-100 text-amber-800'
                : isAwaitingFinalize
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-green-100 text-green-800',
            )}
          >
            {isRaw ? 'RAW' : isAwaitingFinalize ? 'Upload OK' : 'Potpisana'}
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
          Preuzmite generisani obrazac za štampu, potpišite ga, zatim uploadujte PDF.
          {requireSignedPdf ? ' Potpisani PDF je obavezan prije finalizacije.' : ''}
          {allowFinalizeWithoutUpload
            ? ' Administrator može finalizovati bez uploada (postavka uključena).'
            : null}
        </p>
      ) : null}
      {canUpload ? (
        <p className="text-xs text-gray-400">Maksimalna veličina uploada: {maxUploadMb} MB</p>
      ) : null}
      {inventoryMode ? (
        <p className="text-xs text-gray-500">
          Oprema se mijenja tek nakon zatvaranja sesije popisa. Upload potpisane prenosnice tokom aktivne sesije.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {(inventoryMode || isRaw) && (
          <>
            <button
              type="button"
              onClick={() => void handleDownloadGenerated('docx')}
              disabled={isLoading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-gray-50"
            >
              <Download size={14} /> Obrazac (DOCX)
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadGenerated('pdf')}
              disabled={isLoading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-gray-50"
            >
              <Download size={14} /> Štampa (PDF)
            </button>
            {canPrintPreview ? (
              <button
                type="button"
                onClick={() => void handlePrintPreview()}
                disabled={isLoading}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-gray-50"
              >
                <Eye size={14} /> Pregled za štampu
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleDownloadRaw()}
              disabled={isLoading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-gray-50 text-gray-500"
            >
              <Download size={14} /> HTML (rezerva)
            </button>
          </>
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
            <Upload size={14} /> {transfer.scannedDocUrl ? 'Zamijeni PDF' : 'Upload potpisane'}
            <input
              type="file"
              accept="application/pdf"
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
        {canFinalize && (isAwaitingFinalize || (isRaw && allowFinalizeWithoutUpload)) ? (
          <button
            type="button"
            onClick={() => void handleFinalize()}
            disabled={isLoading}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle size={14} /> Finalizuj prenosnicu
          </button>
        ) : null}
        {!inventoryMode && allowSign && isRaw && !transfer.scannedDocUrl ? (
          <label className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-green-700 text-white rounded-lg cursor-pointer hover:bg-green-800">
            <Upload size={14} /> Upload + potpis
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void (async () => {
                    await handleUpload(file);
                    await handleFinalize();
                  })();
                }
              }}
            />
          </label>
        ) : null}
      </div>
      {finalizeBlocked ? (
        <p className="text-xs text-amber-800" title="Finalizacija je blokirana dok je sesija popisa aktivna">
          Finalizacija prenosnice nije dostupna dok traje godišnji popis — promjena opreme se primjenjuje pri zatvaranju
          sesije.
        </p>
      ) : null}
      {generatedPrintPreviewUrl ? (
        <div className="mt-2">
          <iframe
            src={generatedPrintPreviewUrl}
            title="Pregled generisanog PDF-a za štampu"
            className="w-full h-[360px] border rounded bg-white"
          />
        </div>
      ) : null}
      {previewUrl && (
        <div className="mt-2">
          {uploadMeta?.mime.startsWith('image/') ? (
            <img src={previewUrl} alt="Sken prenosnice" className="max-h-64 rounded border" />
          ) : (
            <iframe src={previewUrl} title="Sken potpisane prenosnice" className="w-full h-64 border rounded" />
          )}
          <p className="text-[10px] text-gray-400 mt-1">
            {getApiBaseUrl()}/uploads/{uploadMeta?.id}
          </p>
        </div>
      )}
    </div>
  );
};
