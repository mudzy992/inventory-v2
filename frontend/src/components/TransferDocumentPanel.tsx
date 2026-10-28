import { CheckCircle, Download, Eye, FileText, RefreshCw, Upload } from 'lucide-react';
import type { InventorySessionStatus } from '../api/inventory-api';
import { apiRequest, fetchAuthenticatedBlob, getApiBaseUrl } from '../api/client';
import { signTransferApi, uploadTransferDocumentApi } from '../api/data-api';
import type { TransferRecord } from '../types';
import {
  buildInventoryTransferSteps,
  getInventoryTransferBadge,
} from './inventory-count/inventory-transfer-step.util';
import { buildTransferSteps, getTransferStepBadge } from './transfers/transfer-step.util';
import {
  describeGeneratedPdfStatus,
  shouldPollGeneratedDocumentStatus,
  shouldUseGeneratedDocumentPolling,
  type GeneratedDocumentJobStatus,
  type GeneratedDocumentStatusResponse,
} from './transfers/generated-document-status.util';
import {
  useTransferDocumentPreview,
  type TransferDocumentPreviewMode,
} from './transfers/use-transfer-document-preview';
import { cn } from '../utils/cn';
import { useEffectiveSettings } from '../hooks/use-effective-settings';
import { isAdmin, isEvidenticar, isModerator } from '../store';
import { useToast } from '../contexts/toast-context';
import {
  canFinalizeTransfer,
  canSignTransfer,
  canShowTransferGeneratedDocx,
  canShowTransferGeneratedPdf,
} from '../helpers/guards';
import { ApiError } from '../api/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDocumentJobUpdates, useNotifications } from '../contexts/SocketContext';

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
  const { getBoolean: getEffectiveBoolean, getNumber: getEffectiveNumber, settings: effectiveSettings } = useEffectiveSettings();
  const { toastError } = useToast();
  const { isConnected } = useNotifications();
  const isPdfGenerationEnabled = getEffectiveBoolean('transfer.generate_print_pdf', true);
  const maxUploadMb = getEffectiveNumber('upload.max_mb', 10);
  const allowFinalizeWithoutUpload =
    isAdmin() && getEffectiveBoolean('transfer.allow_finalize_without_upload', false);
  const requireSignedPdf = getEffectiveBoolean('transfer.require_signed_pdf_upload', true);
  const [isLoading, setIsLoading] = useState(false);
  const [docxStatus, setDocxStatus] = useState<
    'not_requested' | 'queued' | 'running' | 'done' | 'failed'
  >(transfer.documentGenerationStatus ?? 'not_requested');
  const [hasGeneratedDocx, setHasGeneratedDocx] = useState(transfer.hasGeneratedDocument === true);
  const [pdfStatus, setPdfStatus] = useState<GeneratedDocumentJobStatus>('none');
  const [hasGeneratedPdf, setHasGeneratedPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [hasRealtimeDocumentUpdate, setHasRealtimeDocumentUpdate] = useState(false);
  const refreshStatusRef = useRef<() => void>(() => undefined);
  const isDrawer = layout === 'drawer';

  useEffect(() => {
    setDocxStatus(transfer.documentGenerationStatus ?? 'not_requested');
    setHasGeneratedDocx(transfer.hasGeneratedDocument === true);
  }, [transfer.id, transfer.documentGenerationStatus, transfer.hasGeneratedDocument]);

  useEffect(() => {
    setPdfStatus('none');
    setHasGeneratedPdf(false);
    setPdfError(null);
    setHasRealtimeDocumentUpdate(false);
  }, [transfer.id]);

  useEffect(() => {
    // Realtime streams are not replayed on reconnect; require a fresh event
    // before trusting the socket again for this transfer.
    setHasRealtimeDocumentUpdate(false);
  }, [isConnected, transfer.id]);

  const handleDocumentJobUpdated = useCallback(() => {
    setHasRealtimeDocumentUpdate(true);
    refreshStatusRef.current();
  }, []);
  useDocumentJobUpdates('transfer', transfer.id, handleDocumentJobUpdated);

  const shouldPollStatus = shouldPollGeneratedDocumentStatus(pdfStatus, docxStatus);
  const shouldUsePolling = shouldUseGeneratedDocumentPolling(
    shouldPollStatus,
    isConnected,
    hasRealtimeDocumentUpdate,
  );
  useEffect(() => {
    if (!isPdfGenerationEnabled) {
      setPdfStatus('none');
      setHasGeneratedPdf(false);
      setPdfError(null);
    }
    let disposed = false;
    const refreshStatus = async () => {
      try {
        const status = await apiRequest<GeneratedDocumentStatusResponse>(
          `/transfers/${transfer.id}/generated-document/status`,
        );
        if (!disposed) {
          setDocxStatus(status.docxStatus ?? 'not_requested');
          setHasGeneratedDocx(status.hasGeneratedDocument === true);
          if (isPdfGenerationEnabled) {
            setPdfStatus(status.status ?? 'none');
            setHasGeneratedPdf(status.hasGeneratedPdf === true);
            setPdfError(status.error ?? null);
          }
        }
      } catch {
        // Keep the last known state; status polling is best-effort.
      }
    };
    refreshStatusRef.current = () => {
      void refreshStatus();
    };
    void refreshStatus();
    if (!shouldUsePolling) {
      return () => {
        disposed = true;
      };
    }
    const interval = window.setInterval(() => void refreshStatus(), 3_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [transfer.id, isPdfGenerationEnabled, shouldUsePolling, isConnected]);
  const effectiveAutoPreview = isDrawer ? autoPreview : false;

  const {
    uploadMeta,
    previewUrl,
    previewError,
    isPreviewLoading,
    handleManualGeneratedPreview,
    handleManualSignedPreview,
    reloadAutoPreview,
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

  const handleRetryGeneratedDocument = async () => {
    setIsLoading(true);
    try {
      const status = await apiRequest<GeneratedDocumentStatusResponse>(
        `/transfers/${transfer.id}/generated-document/retry`,
        { method: 'POST' },
      );
      setDocxStatus(status.docxStatus ?? 'not_requested');
      setHasGeneratedDocx(status.hasGeneratedDocument === true);
      if (isPdfGenerationEnabled) {
        setPdfStatus(status.status ?? 'none');
        setHasGeneratedPdf(status.hasGeneratedPdf === true);
        setPdfError(status.error ?? null);
      }
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Ponovni pokušaj generisanja nije uspio.');
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
  const generatedDocumentState = { ...transfer, hasGeneratedDocument: hasGeneratedDocx };
  const canShowDocx =
    canShowTransferGeneratedDocx(generatedDocumentState) && (inventoryMode || isRaw);
  const canShowPdf =
    canShowTransferGeneratedPdf(generatedDocumentState, effectiveSettings) && (inventoryMode || isRaw);
  const pdfNotice = isPdfGenerationEnabled
    ? describeGeneratedPdfStatus(pdfStatus, hasGeneratedPdf, pdfError)
    : null;
  const showPdfNotice = Boolean(pdfNotice && (canShowPdf || shouldPollStatus));
  const pdfNoticeClass = cn(
    'text-xs rounded px-2 py-1.5 border',
    pdfNotice?.tone === 'info'
      ? 'text-blue-700 bg-blue-50 border-blue-200'
      : 'text-amber-700 bg-amber-50 border-amber-200',
  );
  const showAutoPreview = Boolean(effectiveAutoPreview);
  const showSignedDownload = isDrawer && effectiveAutoPreview === 'signed' && uploadMeta;
  const badgeClass =
    inventoryBadge?.tone === 'success'
      ? 'bg-green-100 text-green-800'
      : inventoryBadge?.tone === 'info'
        ? 'bg-blue-100 text-blue-800'
        : 'bg-amber-100 text-amber-800';

  const previewFrameClass = isDrawer
    ? 'h-full min-h-0 w-full rounded-lg border border-gray-200 bg-white'
    : 'w-full h-[360px] border rounded bg-white';

  const drawerPreview = isDrawer && showAutoPreview ? (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {isPreviewLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-500">Učitavanje PDF pregleda…</p>
        </div>
      ) : null}
      {!isPreviewLoading && previewError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
            {previewError}
          </p>
          {effectiveAutoPreview === 'generated' ? (
            <button
              type="button"
              onClick={() => void reloadAutoPreview()}
              className="text-xs text-blue-700 hover:underline"
            >
              Pokušaj ponovo
            </button>
          ) : null}
        </div>
      ) : null}
      {!isPreviewLoading && previewUrl ? (
        uploadMeta?.mime.startsWith('image/') && effectiveAutoPreview === 'signed' ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <img
              src={previewUrl}
              alt="Sken prenosnice"
              className="max-h-full max-w-full rounded-lg border object-contain bg-white"
            />
          </div>
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
      {!isPreviewLoading && !previewUrl && !previewError ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-500">PDF pregled nije dostupan.</p>
        </div>
      ) : null}
    </div>
  ) : null;

  const actionButtons = (
    <>
      {showSignedDownload ? (
        <button
          type="button"
          onClick={() => void handleDownloadSigned()}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Download size={14} /> Preuzmi potpisani PDF
        </button>
      ) : null}
      {canShowDocx ? (
        <button
          type="button"
          onClick={() => void handleDownloadGenerated('docx')}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs border rounded-lg bg-white hover:bg-gray-50"
        >
          <Download size={14} /> Obrazac (DOCX)
        </button>
      ) : null}
      {!inventoryMode &&
      (isAdmin() || isEvidenticar() || isModerator()) &&
      docxStatus === 'failed' ? (
        <button
          type="button"
          onClick={() => void handleRetryGeneratedDocument()}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs border rounded-lg bg-white hover:bg-gray-50"
        >
          <RefreshCw size={14} /> Ponovi generisanje DOCX-a
        </button>
      ) : null}
      {canShowPdf ? (
        <button
          type="button"
          onClick={() => void handleDownloadGenerated('pdf')}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs border rounded-lg bg-white hover:bg-gray-50"
        >
          <Download size={14} /> Štampa (PDF)
        </button>
      ) : null}
      {canShowPdf && canPrintPreview && !showAutoPreview ? (
        <button
          type="button"
          onClick={handleManualGeneratedPreview}
          disabled={isLoading || isPreviewLoading}
          className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs border rounded-lg bg-white hover:bg-gray-50"
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
            className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs border rounded-lg bg-white hover:bg-gray-50"
          >
            <Eye size={14} /> Pregled skena
          </button>
          <button
            type="button"
            onClick={() => void handleDownloadSigned()}
            className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs border rounded-lg bg-white hover:bg-gray-50"
          >
            <Download size={14} /> Preuzmi sken
          </button>
        </>
      ) : null}
      {canUpload ? (
        <label className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700">
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
          className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          <CheckCircle size={14} /> Finalizuj prenosnicu
        </button>
      ) : null}
      {!inventoryMode && allowSign && isRaw && !transfer.scannedDocUrl ? (
        <label className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs bg-green-700 text-white rounded-lg cursor-pointer hover:bg-green-800">
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
          className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs border rounded-lg bg-white hover:bg-gray-50"
        >
          <Download size={14} /> Preuzmi potpisani PDF
        </button>
      ) : null}
    </>
  );

  if (isDrawer) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-gray-100 bg-white px-4 py-3 md:px-5">
          <div className="flex flex-wrap items-center gap-2">{actionButtons}</div>
          {finalizeBlocked ? (
            <p className="mt-2 text-xs text-amber-800">
              Finalizacija nije dostupna dok traje godišnji popis.
            </p>
          ) : null}
          {showPdfNotice && pdfNotice ? (
            <p className={cn('mt-2', pdfNoticeClass)} role="status">
              {pdfNotice.message}
            </p>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden bg-gray-50 p-3 md:p-4">{drawerPreview}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3 border border-gray-200 rounded-lg p-4 bg-gray-50">
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
          Preuzmite generisani Word obrazac za štampu, potpišite ga, zatim uploadujte PDF.
          {requireSignedPdf ? ' Potpisani PDF je obavezan prije finalizacije.' : ''}
          {allowFinalizeWithoutUpload
            ? ' Administrator može finalizovati bez uploada (postavka uključena).'
            : null}
        </p>
      ) : null}
      {!inventoryMode &&
      !hasGeneratedDocx &&
      (docxStatus === 'queued' || docxStatus === 'running') ? (
        <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
          Word obrazac se generiše; pokušajte preuzeti ponovo za nekoliko sekundi.
        </p>
      ) : null}
      {!inventoryMode &&
      !hasGeneratedDocx &&
      docxStatus === 'failed' ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Generisanje Word obrasca nije uspjelo — provjerite aktivni .docx predložak i ponovite pokušaj.
        </p>
      ) : null}
      {!inventoryMode &&
      isRaw &&
      !hasGeneratedDocx &&
      docxStatus === 'not_requested' ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Generisani obrazac još nije dostupan — provjerite aktivni .docx template skladišta povezanog
          s prenosom.
        </p>
      ) : null}
      {showPdfNotice && pdfNotice ? (
        <p className={pdfNoticeClass} role="status">
          {pdfNotice.message}
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

      <div className="flex flex-wrap gap-2">{actionButtons}</div>

      {finalizeBlocked ? (
        <p className="text-xs text-amber-800" title="Finalizacija je blokirana dok je sesija popisa aktivna">
          Finalizacija prenosnice nije dostupna dok traje godišnji popis — promjena opreme se primjenjuje pri zatvaranju
          sesije.
        </p>
      ) : null}

      {previewUrl && !showAutoPreview ? (
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
          {uploadMeta ? (
            <p className="text-[10px] text-gray-400 mt-1">
              {getApiBaseUrl()}/uploads/{uploadMeta.id}
            </p>
          ) : null}
        </div>
      ) : null}
      {previewError && !showAutoPreview ? (
        <p className="text-xs text-amber-700">{previewError}</p>
      ) : null}
    </div>
  );
};
