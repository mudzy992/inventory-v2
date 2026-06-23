import { CheckCircle, Download, Eye, FileText, Upload } from 'lucide-react';
import type { InventorySessionStatus } from '../api/inventory-api';
import { fetchAuthenticatedBlob, getApiBaseUrl } from '../api/client';
import { signTransferApi, uploadTransferDocumentApi } from '../api/data-api';
import type { TransferRecord } from '../types';
import {
  buildInventoryTransferSteps,
  getInventoryTransferBadge,
} from './inventory-count/inventory-transfer-step.util';
import { buildTransferSteps, getTransferStepBadge } from './transfers/transfer-step.util';
import {
  useTransferDocumentPreview,
  type TransferDocumentPreviewMode,
} from './transfers/use-transfer-document-preview';
import { cn } from '../utils/cn';
import { useAdminSettings } from '../contexts/admin-settings-context';
import { isAdmin } from '../store';
import { useToast } from '../contexts/toast-context';
import {
  canFinalizeTransfer,
  canSignTransfer,
  canShowTransferGeneratedDocx,
  canShowTransferGeneratedPdf,
} from '../helpers/guards';
import { ApiError } from '../api/client';
import { useState } from 'react';

interface TransferDocumentPanelProps {
  transfer: TransferRecord;
  onSigned?: () => void;
  allowSign?: boolean;
  inventoryMode?: boolean;
  inventorySessionStatus?: InventorySessionStatus;
  linePendingApplied?: boolean;
  layout?: 'inline' | 'drawer';
  autoPreview?: TransferDocumentPreviewMode | false;
}

export const TransferDocumentPanel = ({
  transfer,
  onSigned,
  allowSign = false,
  inventoryMode = false,
  inventorySessionStatus = 'active',
  linePendingApplied = false,
  layout = 'inline',
  autoPreview = false,
}: TransferDocumentPanelProps) => {
  const { getBoolean, getNumber, settings: adminSettings } = useAdminSettings();
  const { toastError } = useToast();
  const maxUploadMb = getNumber('upload.max_mb', 10);
  const allowFinalizeWithoutUpload =
    isAdmin() && getBoolean('transfer.allow_finalize_without_upload', false);
  const requireSignedPdf = getBoolean('transfer.require_signed_pdf_upload', true);
  const [isLoading, setIsLoading] = useState(false);
  const isDrawer = layout === 'drawer';
  const effectiveAutoPreview = isDrawer ? autoPreview : false;

  const {
    uploadMeta,
    previewUrl,
    previewError,
    isPreviewLoading,
    handleManualGeneratedPreview,
    handleManualSignedPreview,
  } = useTransferDocumentPreview({
    transfer,
    autoPreview: effectiveAutoPreview,
  });

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

  const handleDownloadSigned = async () => {
    if (!uploadMeta) {
      return;
    }
    const blob = await fetchAuthenticatedBlob(`/uploads/${uploadMeta.id}`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${transfer.documentNumber}-signed.pdf`;
    link.click();
    URL.revokeObjectURL(url);
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
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Obrazac nije generisan — provjerite aktivni .docx template skladišta.';
      toastError(message);
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
  const isSigned = transfer.status === 'potpisan';
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
  const canShowDocx =
    canShowTransferGeneratedDocx(transfer) && (inventoryMode || isRaw);
  const canShowPdf =
    canShowTransferGeneratedPdf(transfer, adminSettings) && (inventoryMode || isRaw);
  const showAutoPreview = Boolean(effectiveAutoPreview);
  const showSignedDownload = isDrawer && effectiveAutoPreview === 'signed' && uploadMeta;
  const badgeClass =
    inventoryBadge?.tone === 'success'
      ? 'bg-green-100 text-green-800'
      : inventoryBadge?.tone === 'info'
        ? 'bg-blue-100 text-blue-800'
        : 'bg-amber-100 text-amber-800';

  const previewFrameClass = isDrawer
    ? 'w-full min-h-[50vh] md:min-h-[55vh] border rounded-lg bg-white'
    : 'w-full h-[360px] border rounded bg-white';

  return (
    <div
      className={cn(
        'space-y-3',
        !isDrawer && 'border border-gray-200 rounded-lg p-4 bg-gray-50',
      )}
    >
      {!isDrawer ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
            <FileText size={16} />
            Prenosnica {transfer.documentNumber}
          </div>
          {inventoryMode && inventoryBadge ? (
            <span className={cn('text-xs px-2 py-0.5 rounded-full', badgeClass)}>
              {inventoryBadge.label}
            </span>
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
      ) : null}

      {isDrawer && showAutoPreview ? (
        <div className="space-y-2">
          {isPreviewLoading ? (
            <p className="text-sm text-gray-500 py-8 text-center">Učitavanje PDF pregleda…</p>
          ) : null}
          {previewError ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {previewError}
            </p>
          ) : null}
          {previewUrl ? (
            uploadMeta?.mime.startsWith('image/') && effectiveAutoPreview === 'signed' ? (
              <img
                src={previewUrl}
                alt="Sken prenosnice"
                className="max-h-[60vh] w-full rounded-lg border object-contain bg-white"
              />
            ) : (
              <iframe
                src={previewUrl}
                title={
                  effectiveAutoPreview === 'signed'
                    ? 'Pregled potpisane prenosnice'
                    : 'Pregled generisanog PDF-a za štampu'
                }
                className={previewFrameClass}
              />
            )
          ) : null}
        </div>
      ) : null}

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
      {!inventoryMode && standardSteps && !isDrawer ? (
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
      {!inventoryMode && isRaw && !isDrawer ? (
        <p className="text-xs text-gray-500">
          Preuzmite generisani Word obrazac za štampu, potpišite ga, zatim uploadujte PDF.
          {requireSignedPdf ? ' Potpisani PDF je obavezan prije finalizacije.' : ''}
          {allowFinalizeWithoutUpload
            ? ' Administrator može finalizovati bez uploada (postavka uključena).'
            : null}
        </p>
      ) : null}
      {!inventoryMode && isRaw && transfer.hasGeneratedDocument === false ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Generisani obrazac još nije dostupan — provjerite aktivni .docx template skladišta povezanog
          s prenosom.
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

      <div
        className={cn(
          'flex flex-wrap gap-2',
          isDrawer && 'sticky bottom-0 z-10 -mx-1 border-t border-gray-100 bg-white pt-3 pb-1 md:static md:border-0 md:pt-0 md:pb-0',
        )}
      >
        {showSignedDownload ? (
          <button
            type="button"
            onClick={() => void handleDownloadSigned()}
            disabled={isLoading}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Download size={14} /> Preuzmi potpisani PDF
          </button>
        ) : null}
        {canShowDocx ? (
          <button
            type="button"
            onClick={() => void handleDownloadGenerated('docx')}
            disabled={isLoading}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-gray-50"
          >
            <Download size={14} /> Obrazac (DOCX)
          </button>
        ) : null}
        {canShowPdf ? (
          <button
            type="button"
            onClick={() => void handleDownloadGenerated('pdf')}
            disabled={isLoading}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-gray-50"
          >
            <Download size={14} /> Štampa (PDF)
          </button>
        ) : null}
        {canShowPdf && canPrintPreview && !showAutoPreview ? (
          <button
            type="button"
            onClick={handleManualGeneratedPreview}
            disabled={isLoading || isPreviewLoading}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-gray-50"
          >
            <Eye size={14} /> Pregled za štampu
          </button>
        ) : null}
        {uploadMeta && !showAutoPreview ? (
          <>
            <button
              type="button"
              onClick={handleManualSignedPreview}
              disabled={isLoading || isPreviewLoading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-gray-50"
            >
              <Eye size={14} /> Pregled skena
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadSigned()}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-gray-50"
            >
              <Download size={14} /> Preuzmi sken
            </button>
          </>
        ) : null}
        {canUpload ? (
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
        ) : null}
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
        {isDrawer && isSigned && uploadMeta && !showSignedDownload ? (
          <button
            type="button"
            onClick={() => void handleDownloadSigned()}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-gray-50"
          >
            <Download size={14} /> Preuzmi potpisani PDF
          </button>
        ) : null}
      </div>

      {finalizeBlocked ? (
        <p className="text-xs text-amber-800" title="Finalizacija je blokirana dok je sesija popisa aktivna">
          Finalizacija prenosnice nije dostupna dok traje godišnji popis — promjena opreme se primjenjuje pri zatvaranju
          sesije.
        </p>
      ) : null}

      {!isDrawer && previewUrl && !showAutoPreview ? (
        <div className="mt-2">
          {uploadMeta?.mime.startsWith('image/') ? (
            <img src={previewUrl} alt="Sken prenosnice" className="max-h-64 rounded border" />
          ) : (
            <iframe
              src={previewUrl}
              title="Pregled dokumenta"
              className="w-full h-64 border rounded"
            />
          )}
          {!showAutoPreview && uploadMeta ? (
            <p className="text-[10px] text-gray-400 mt-1">
              {getApiBaseUrl()}/uploads/{uploadMeta.id}
            </p>
          ) : null}
        </div>
      ) : null}
      {!isDrawer && previewError && !showAutoPreview ? (
        <p className="text-xs text-amber-700">{previewError}</p>
      ) : null}
    </div>
  );
};
