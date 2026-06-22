import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useStore, useRefreshData } from '../../useStore';
import { signTransferApi, uploadTransferDocumentApi, fetchTransferApi } from '../../api/data-api';
import { fetchTransfersPageApi } from '../../api/transfers-api';
import type { TransferWorkflowFilter } from '../../api/transfers-api';
import {
  getTransferEquipmentLabel,
  getTransferFromPersonName,
  getTransferToPersonName,
} from '../../helpers/transfer-display.util';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { ApiError, fetchAuthenticatedBlob } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { getStatusLabel, formatDate } from '../../helpers';
import { useAdminSettings } from '../../contexts/admin-settings-context';
import {
  canSignTransfer,
  canFinalizeTransfer,
  isTransferAwaitingFinalize,
  canShowTransferGeneratedDocx,
} from '../../helpers/guards';
import { getTransferStepBadge } from './transfer-step.util';
import { refreshAfterMutation } from '../../helpers/run-mutation-with-refresh.util';
import { Search, Download, Upload, CheckCircle, Eye } from 'lucide-react';
import { TransferDocumentPanel } from '../TransferDocumentPanel';
import { PaginationControls } from '../ui/pagination-controls';
import { ModalRoot } from '../ui/modal-root';
import { PageTabs } from '../ui/page-tabs';
import type { TransferRecord } from '../../types';

type DocumentsWorkflowTab = 'pending' | 'signed';

const stepBadgeClass = (tone: 'warning' | 'success' | 'info'): string => {
  if (tone === 'success') {
    return 'bg-green-100 text-green-800';
  }
  if (tone === 'info') {
    return 'bg-blue-100 text-blue-800';
  }
  return 'bg-amber-100 text-amber-800';
};

export const TransferDocumentsTab = () => {
  const [state] = useStore();
  const refresh = useRefreshData();
  const { toastError } = useToast();
  const { getBoolean: getAdminBoolean } = useAdminSettings();
  const [workflowTab, setWorkflowTab] = useState<DocumentsWorkflowTab>('pending');
  const [pendingCount, setPendingCount] = useState(0);
  const [viewDoc, setViewDoc] = useState<string | null>(null);
  const [viewTransfer, setViewTransfer] = useState<TransferRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const fetchPage = useCallback(
    (params: Parameters<typeof fetchTransfersPageApi>[0]) =>
      fetchTransfersPageApi({
        ...params,
        workflow: workflowTab as TransferWorkflowFilter,
      }),
    [workflowTab],
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
    void fetchTransfersPageApi({ workflow: 'pending', page: 1, pageSize: 1 })
      .then((response) => setPendingCount(response.meta.total))
      .catch(() => setPendingCount(0));
  }, [list.items, list.meta?.total]);

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

  const workflowTabs = useMemo(
    () => [
      { id: 'pending' as const, label: 'Čeka obradu', badge: pendingCount },
      { id: 'signed' as const, label: 'Potpisano' },
    ],
    [pendingCount],
  );

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
    if (!uploadingId || !file) {
      return;
    }
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

  const renderQuickActions = (t: TransferRecord) => {
    const canManageActions =
      t.status !== 'potpisan' &&
      t.status !== 'cancelled' &&
      canFinalizeTransfer(t.status).allowed;
    const showDownload = canShowTransferGeneratedDocx(t);

    return (
      <div className="flex flex-wrap gap-1.5">
        {showDownload ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void handleDownloadGenerated(t.id, 'docx');
            }}
            className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-200"
          >
            <Download size={12} /> Obrazac
          </button>
        ) : null}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setViewDoc(t.id);
          }}
          className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-100"
        >
          <Eye size={12} /> Pregled
        </button>
        {canManageActions ? (
          <>
            {t.status === 'raw' ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleSignDoc(t.id);
                }}
                className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2 py-1 rounded-lg hover:bg-green-100"
              >
                <Upload size={12} /> Sken
              </button>
            ) : null}
            {t.status === 'raw' || isTransferAwaitingFinalize(t.status) ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleMarkSigned(t.id);
                }}
                className="inline-flex items-center gap-1 text-xs bg-green-600 text-white px-2 py-1 rounded-lg hover:bg-green-700"
              >
                <CheckCircle size={12} />{' '}
                {isTransferAwaitingFinalize(t.status) ? 'Finalizuj' : 'Potpiši'}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    );
  };

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Dokumentacija prenosa opreme — generisani Word obrazac i potpisani PDF.
      </p>

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={handleFileUpload}
      />

      <PageTabs
        tabs={workflowTabs}
        activeTab={workflowTab}
        onChange={setWorkflowTab}
        className="mb-4"
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pretraži po broju dokumenta, inv. broju..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
      </div>

      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-3 py-2.5 font-medium text-gray-600">Br. dokumenta</th>
              <th className="px-3 py-2.5 font-medium text-gray-600">Status</th>
              <th className="px-3 py-2.5 font-medium text-gray-600">Tip</th>
              <th className="px-3 py-2.5 font-medium text-gray-600">Oprema</th>
              <th className="px-3 py-2.5 font-medium text-gray-600">Od → Ka</th>
              <th className="px-3 py-2.5 font-medium text-gray-600">Datum</th>
              <th className="px-3 py-2.5 font-medium text-gray-600">Akcije</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((t) => {
              const stepBadge = getTransferStepBadge(t);
              const fromName = getTransferFromPersonName(t);
              const toName = getTransferToPersonName(t);
              const fromLabel = t.fromType === 'skladiste' ? 'Skladište' : fromName || '—';
              const toLabel =
                t.toType === 'skladiste' ? 'Skladište' : t.toType === 'rashod' ? 'RASHOD' : toName || '—';

              return (
                <tr
                  key={t.id}
                  className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setViewDoc(t.id)}
                >
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold text-gray-800">
                    {t.documentNumber}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stepBadgeClass(stepBadge.tone)}`}>
                      {stepBadge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-700">{getStatusLabel(t.type)}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-700 max-w-[180px] truncate">
                    {getTransferEquipmentLabel(t)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[160px] truncate">
                    {fromLabel} → {toLabel}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                    {formatDate(t.date)}
                  </td>
                  <td className="px-3 py-2.5">{renderQuickActions(t)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.isLoading && transfers.length === 0 ? (
          <p className="p-8 text-center text-gray-400 text-sm">Nema prenosnica</p>
        ) : null}
      </div>

      <div className="md:hidden space-y-3">
        {transfers.map((t) => {
          const cat = t.equipment?.categoryId
            ? state.categories.find((c) => c.id === t.equipment!.categoryId)
            : null;
          const fromName = getTransferFromPersonName(t);
          const toName = getTransferToPersonName(t);
          const stepBadge = getTransferStepBadge(t);

          return (
            <div
              key={t.id}
              className={`bg-white rounded-xl shadow-sm border ${
                t.status === 'raw'
                  ? 'border-yellow-200'
                  : t.status === 'uploaded'
                    ? 'border-blue-200'
                    : 'border-gray-100'
              } overflow-hidden`}
            >
              <button
                type="button"
                className="w-full text-left p-4"
                onClick={() => setViewDoc(t.id)}
              >
                <div className="flex items-start justify-between mb-2 gap-2">
                  <span className="font-mono text-sm font-bold text-gray-800">{t.documentNumber}</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${stepBadgeClass(stepBadge.tone)}`}>
                    {stepBadge.label}
                  </span>
                </div>
                <div className="space-y-1 text-xs text-gray-600">
                  <p>
                    <span className="text-gray-400">Tip:</span> {getStatusLabel(t.type)}
                  </p>
                  <p>
                    <span className="text-gray-400">Oprema:</span> {getTransferEquipmentLabel(t)}
                    {cat ? ` — ${cat.name}` : ''}
                  </p>
                  <p>
                    <span className="text-gray-400">Od → Ka:</span>{' '}
                    {t.fromType === 'skladiste' ? 'Skladište' : fromName || '—'}
                    {' → '}
                    {t.toType === 'skladiste' ? 'Skladište' : t.toType === 'rashod' ? 'RASHOD' : toName || '—'}
                  </p>
                  <p>
                    <span className="text-gray-400">Datum:</span> {formatDate(t.date)}
                  </p>
                </div>
              </button>
              <div className="px-4 pb-4 pt-0 border-t border-gray-50">{renderQuickActions(t)}</div>
            </div>
          );
        })}
        {!list.isLoading && transfers.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
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
        <ModalRoot
          open
          onClose={() => setViewDoc(null)}
          size="xl"
          panelClassName="bg-white shadow-xl max-w-3xl"
          enableEscape
          closeOnBackdrop
        >
          <div className="bg-white rounded-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Prenosnica {viewTransfer.documentNumber}
                </h2>
                <p className="text-sm text-gray-500">
                  {getStatusLabel(viewTransfer.type)} · {formatDate(viewTransfer.date)}
                </p>
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
