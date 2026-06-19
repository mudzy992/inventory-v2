import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore, useRefreshData } from '../../useStore';
import { signTransferApi, uploadTransferDocumentApi, fetchTransferApi } from '../../api/data-api';
import { fetchTransfersPageApi } from '../../api/transfers-api';
import {
  getTransferEquipmentLabel,
  getTransferFromPersonName,
  getTransferSignerName,
  getTransferToPersonName,
} from '../../helpers/transfer-display.util';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { ApiError, fetchAuthenticatedBlob } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { getStatusLabel, formatDate } from '../../helpers';
import { useAdminSettings } from '../../contexts/admin-settings-context';
import { canSignTransfer, canFinalizeTransfer, isTransferAwaitingFinalize } from '../../helpers/guards';
import { getTransferStepBadge } from './transfer-step.util';
import { refreshAfterMutation } from '../../helpers/run-mutation-with-refresh.util';
import { Search, Filter, FileText, Download, Upload, CheckCircle, Eye } from 'lucide-react';
import { TransferDocumentPanel } from '../TransferDocumentPanel';
import { PaginationControls } from '../ui/pagination-controls';
import { ModalRoot } from '../ui/modal-root';
import type { TransferRecord } from '../../types';

export const TransferDocumentsTab = () => {
  const [state] = useStore();
  const refresh = useRefreshData();
  const { toastError } = useToast();
  const { getBoolean: getAdminBoolean } = useAdminSettings();
  const [filterStatus, setFilterStatus] = useState('');
  const [viewDoc, setViewDoc] = useState<string | null>(null);
  const [viewTransfer, setViewTransfer] = useState<TransferRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const fetchPage = useCallback(
    (params: Parameters<typeof fetchTransfersPageApi>[0]) =>
      fetchTransfersPageApi({
        ...params,
        ...(filterStatus ? { status: filterStatus as TransferRecord['status'] } : {}),
      }),
    [filterStatus],
  );

  const list = usePaginatedList<TransferRecord, Record<string, never>>({
    fetchPage,
    initialSortBy: 'date',
    initialSortDir: 'desc',
  });

  const search = list.search;
  const setSearch = list.setSearch;
  const transfers = list.items;

  useEffect(() => {
    if (!viewDoc) {
      setViewTransfer(null);
      return;
    }
    const fromList = transfers.find((row) => row.id === viewDoc);
    if (fromList) {
      setViewTransfer(fromList);
      return;
    }
    void fetchTransferApi(viewDoc)
      .then((row) => setViewTransfer(row as TransferRecord))
      .catch(() => setViewTransfer(null));
  }, [transfers, viewDoc]);

  const handleDownloadGenerated = async (transferId: string, format: 'docx' | 'pdf' = 'docx') => {
    try {
      const blob = await fetchAuthenticatedBlob(
        `/transfers/${transferId}/generated-document?format=${format}`,
      );
      const transfer =
        transfers.find((row) => row.id === transferId) ??
        ((await fetchTransferApi(transferId)) as TransferRecord);
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
    }
  };

  const handleSignDoc = (transferId: string) => {
    setUploadingId(transferId);
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!uploadingId || !file) return;
    try {
      await uploadTransferDocumentApi(uploadingId, file);
      await signTransferApi(uploadingId, {});
      await refreshAfterMutation([refresh, list.refresh]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška pri uploadu';
      toastError(message);
    } finally {
      setUploadingId(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleMarkSigned = async (transferId: string) => {
    const transfer = transfers.find((row) => row.id === transferId);
    const signGuard = canSignTransfer({
      hasUploadedPdf: Boolean(transfer?.scannedDocUrl),
      requireSignedUpload: getAdminBoolean('transfer.require_signed_pdf_upload', true),
      allowFinalizeWithoutUpload: getAdminBoolean('transfer.allow_finalize_without_upload', false),
    });
    if (!signGuard.allowed) {
      toastError(signGuard.reason ?? 'Finalizacija nije dozvoljena.');
      return;
    }
    try {
      await signTransferApi(transferId, {});
      await refreshAfterMutation([refresh, list.refresh]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška pri potpisivanju';
      toastError(message);
    }
  };

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Dokumentacija prenosa opreme — generisani Word obrazac i potpisani PDF.
      </p>

      <div className="flex flex-wrap gap-2 text-sm mb-4">
        <span className="bg-yellow-50 border border-yellow-200 px-3 py-1.5 rounded-lg text-yellow-700 font-medium">
          RAW na stranici: {transfers.filter((t) => t.status === 'raw').length}
        </span>
        <span className="bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg text-green-700 font-medium">
          Potpisano na stranici: {transfers.filter((t) => t.status === 'potpisan').length}
        </span>
      </div>

      <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Pretraži po broju dokumenta, inv. broju..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
            <option value="">Svi statusi</option>
            <option value="raw">RAW (čeka potpis)</option>
            <option value="potpisan">Potpisan</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {transfers.map((t) => {
          const cat = t.equipment?.categoryId
            ? state.categories.find((c) => c.id === t.equipment!.categoryId)
            : null;
          const fromName = getTransferFromPersonName(t);
          const toName = getTransferToPersonName(t);
          const signerName = getTransferSignerName(t);
          const stepBadge = getTransferStepBadge(t);
          const canManageActions =
            t.status !== 'potpisan' &&
            t.status !== 'cancelled' &&
            canFinalizeTransfer(t.status).allowed;

          return (
            <div key={t.id} className={`bg-white rounded-xl shadow-sm border ${t.status === 'raw' ? 'border-yellow-200' : t.status === 'uploaded' ? 'border-blue-200' : 'border-gray-100'} overflow-hidden`}>
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className={t.status === 'raw' ? 'text-yellow-500' : 'text-green-500'} />
                    <span className="font-mono text-sm font-bold text-gray-800">{t.documentNumber}</span>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    stepBadge.tone === 'success'
                      ? 'bg-green-100 text-green-800'
                      : stepBadge.tone === 'info'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                  }`}>
                    {stepBadge.label}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-gray-600">
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-16">Tip:</span>
                    <span className="font-medium">{getStatusLabel(t.type)}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-16">Oprema:</span>
                    <span>{getTransferEquipmentLabel(t)} — {cat?.name}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-16">Od:</span>
                    <span>{t.fromType === 'skladiste' ? 'Skladište' : fromName || '—'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-16">Ka:</span>
                    <span>{t.toType === 'skladiste' ? 'Skladište' : t.toType === 'rashod' ? 'RASHOD' : toName || '—'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-16">Potpisnik:</span>
                    <span>{signerName || '—'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-16">Datum:</span>
                    <span>{formatDate(t.date)}</span>
                  </div>
                  {t.reason ? (
                    <div className="flex gap-2">
                      <span className="text-gray-400 w-16">Razlog:</span>
                      <span>{t.reason}</span>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => void handleDownloadGenerated(t.id, 'docx')}
                    className="flex items-center gap-1.5 text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Download size={13} /> Preuzmi obrazac
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewDoc(t.id)}
                    className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <Eye size={13} /> Pregled
                  </button>
                  {canManageActions ? (
                    <>
                      {t.status === 'raw' ? (
                        <button
                          type="button"
                          onClick={() => handleSignDoc(t.id)}
                          className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors"
                        >
                          <Upload size={13} /> Priloži sken
                        </button>
                      ) : null}
                      {(t.status === 'raw' || isTransferAwaitingFinalize(t.status)) ? (
                        <button
                          type="button"
                          onClick={() => void handleMarkSigned(t.id)}
                          className="flex items-center gap-1.5 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <CheckCircle size={13} /> {isTransferAwaitingFinalize(t.status) ? 'Finalizuj' : 'Potpiši'}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        {transfers.length === 0 ? (
          <div className="col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
            Nema prenosnica
          </div>
        ) : null}
      </div>

      {list.meta ? (
        <PaginationControls
          page={list.page}
          pageSize={list.pageSize}
          total={list.meta.total}
          totalPages={list.meta.totalPages}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
          className="mt-4 rounded-xl border border-gray-100"
        />
      ) : null}

      {viewTransfer ? (
        <ModalRoot open onClose={() => setViewDoc(null)} size="xl" panelClassName="bg-white shadow-xl max-w-3xl" enableEscape closeOnBackdrop>
          <div className="bg-white rounded-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Prenosnica {viewTransfer.documentNumber}</h2>
                <p className="text-sm text-gray-500">{getStatusLabel(viewTransfer.type)} · {formatDate(viewTransfer.date)}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewDoc(null)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                Zatvori
              </button>
            </div>
            <TransferDocumentPanel
              transfer={viewTransfer}
              allowSign={viewTransfer.status !== 'potpisan' && viewTransfer.status !== 'cancelled'}
              onSigned={() => {
                void refresh();
                void list.refresh();
              }}
            />
          </div>
        </ModalRoot>
      ) : null}
    </div>
  );
};
