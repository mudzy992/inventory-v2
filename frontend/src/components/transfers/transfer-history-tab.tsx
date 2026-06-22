import { useState, useMemo, useEffect, useCallback } from 'react';
import { TransferDocumentPanel } from '../TransferDocumentPanel';
import { useStore, useRefreshData } from '../../useStore';
import { getStatusLabel, formatDate } from '../../helpers';
import { fetchTransferApi } from '../../api/data-api';
import { fetchTransfersPageApi } from '../../api/transfers-api';
import {
  getTransferEquipmentLabel,
  getTransferFromPersonName,
  getTransferSignerName,
  getTransferToPersonName,
} from '../../helpers/transfer-display.util';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { Search, Filter, Warehouse, UserX } from 'lucide-react';
import { PageTabs } from '../ui/page-tabs';
import { ResponsiveTable } from '../ui/responsive-table';
import { PaginationControls } from '../ui/pagination-controls';
import { ModalRoot } from '../ui/modal-root';
import { getTransferStepBadge } from './transfer-step.util';
import {
  InventoryFreezeActionHint,
} from '../inventory-count/inventory-freeze-action-hint';
import type { TransferRecord } from '../../types';
import type { TransferWorkflowFilter } from '../../api/transfers-api';

type HistoryWorkflowTab = 'pending' | 'signed';

const stepBadgeClass = (tone: 'warning' | 'success' | 'info'): string => {
  if (tone === 'success') {
    return 'bg-green-100 text-green-800';
  }
  if (tone === 'info') {
    return 'bg-blue-100 text-blue-800';
  }
  return 'bg-amber-100 text-amber-800';
};

export const TransferHistoryTab = () => {
  const [state] = useStore();
  const refresh = useRefreshData();
  const [workflowTab, setWorkflowTab] = useState<HistoryWorkflowTab>('pending');
  const [filterType, setFilterType] = useState('');
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);
  const [selectedTransfer, setSelectedTransfer] = useState<TransferRecord | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

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

  const filtered = useMemo(
    () => (filterType ? list.items.filter((row) => row.type === filterType) : list.items),
    [filterType, list.items],
  );

  useEffect(() => {
    void fetchTransfersPageApi({ workflow: 'pending', page: 1, pageSize: 1 })
      .then((response) => setPendingCount(response.meta.total))
      .catch(() => setPendingCount(0));
  }, [list.items, list.meta?.total]);

  useEffect(() => {
    if (!selectedTransferId) {
      setSelectedTransfer(null);
      return;
    }
    const fromList = list.items.find((row) => row.id === selectedTransferId);
    if (fromList) {
      setSelectedTransfer(fromList);
      return;
    }
    void fetchTransferApi(selectedTransferId)
      .then((row) => setSelectedTransfer(row as TransferRecord))
      .catch(() => setSelectedTransfer(null));
  }, [list.items, selectedTransferId]);

  const workflowTabs = useMemo(
    () => [
      { id: 'pending' as const, label: 'Na čekanju', badge: pendingCount },
      { id: 'signed' as const, label: 'Potpisano' },
    ],
    [pendingCount],
  );

  const handleSigned = () => {
    void refresh();
    void list.refresh();
    void fetchTransfersPageApi({ workflow: 'pending', page: 1, pageSize: 1 })
      .then((response) => setPendingCount(response.meta.total))
      .catch(() => setPendingCount(0));
    if (selectedTransferId) {
      void fetchTransferApi(selectedTransferId)
        .then((row) => setSelectedTransfer(row as TransferRecord))
        .catch(() => setSelectedTransfer(null));
    }
  };

  return (
    <>
      <InventoryFreezeActionHint />

      <PageTabs
        tabs={workflowTabs}
        activeTab={workflowTab}
        onChange={setWorkflowTab}
        className="mb-4"
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
            placeholder="Pretraži..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="">Svi tipovi</option>
            <option value="zaduzenje">Zaduženje</option>
            <option value="prenos">Prenos</option>
            <option value="razduzenje">Razduženje</option>
            <option value="rashodovanje">Rashodovanje</option>
          </select>
        </div>
      </div>

      <ResponsiveTable
        isEmpty={!list.isLoading && filtered.length === 0}
        emptyMessage={list.isLoading ? 'Učitavanje…' : 'Nema rezultata'}
        mobile={filtered.map((t) => {
          const cat = t.equipment?.categoryId
            ? state.categories.find((c) => c.id === t.equipment!.categoryId)
            : null;
          const fromName = getTransferFromPersonName(t);
          const toName = getTransferToPersonName(t);
          const stepBadge = getTransferStepBadge(t);
          return (
            <button
              key={t.id}
              type="button"
              className="w-full text-left p-4 space-y-1 hover:bg-gray-50"
              onClick={() => setSelectedTransferId(t.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-medium text-gray-800">{t.documentNumber}</span>
                {workflowTab === 'pending' ? (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stepBadgeClass(stepBadge.tone)}`}>
                    {stepBadge.label}
                  </span>
                ) : null}
              </div>
              <p
                className={`text-xs font-semibold ${
                  t.type === 'zaduzenje'
                    ? 'text-green-600'
                    : t.type === 'razduzenje'
                      ? 'text-blue-600'
                      : t.type === 'rashodovanje'
                        ? 'text-red-600'
                        : 'text-orange-600'
                }`}
              >
                {getStatusLabel(t.type)}
              </p>
              <p className="text-xs text-gray-600">
                {getTransferEquipmentLabel(t)} · {cat?.name}
              </p>
              <p className="text-xs text-gray-500">{formatDate(t.date)}</p>
              <p className="text-xs text-gray-500 truncate">
                {t.fromType === 'skladiste' ? 'Skladište' : fromName || '—'}
                {' → '}
                {t.toType === 'skladiste' ? 'Skladište' : t.toType === 'rashod' ? 'RASHOD' : toName || '—'}
              </p>
            </button>
          );
        })}
        desktop={
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">Br. dokumenta</th>
                <th className="px-4 py-3 font-medium text-gray-600">Tip</th>
                <th className="px-4 py-3 font-medium text-gray-600">Oprema</th>
                <th className="px-4 py-3 font-medium text-gray-600">Od</th>
                <th className="px-4 py-3 font-medium text-gray-600">Ka</th>
                <th className="px-4 py-3 font-medium text-gray-600">Potpisnik</th>
                <th className="px-4 py-3 font-medium text-gray-600">Datum</th>
                {workflowTab === 'pending' ? (
                  <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                ) : null}
                <th className="px-4 py-3 font-medium text-gray-600">Razlog</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const cat = t.equipment?.categoryId
                  ? state.categories.find((c) => c.id === t.equipment!.categoryId)
                  : null;
                const fromName = getTransferFromPersonName(t);
                const toName = getTransferToPersonName(t);
                const signerName = getTransferSignerName(t);
                const stepBadge = getTransferStepBadge(t);

                return (
                  <tr
                    key={t.id}
                    className="border-t border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedTransferId(t.id)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-medium text-gray-800">{t.documentNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-semibold ${
                          t.type === 'zaduzenje'
                            ? 'text-green-600'
                            : t.type === 'razduzenje'
                              ? 'text-blue-600'
                              : t.type === 'rashodovanje'
                                ? 'text-red-600'
                                : 'text-orange-600'
                        }`}
                      >
                        {getStatusLabel(t.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-700">{getTransferEquipmentLabel(t)}</span>
                      <p className="text-[10px] text-gray-400">{cat?.name}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {t.fromType === 'skladiste' ? (
                        <span className="text-blue-600 flex items-center gap-1">
                          <Warehouse size={12} /> Skladište
                        </span>
                      ) : (
                        fromName || '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {t.toType === 'skladiste' ? (
                        <span className="text-blue-600 flex items-center gap-1">
                          <Warehouse size={12} /> Skladište
                        </span>
                      ) : t.toType === 'rashod' ? (
                        <span className="text-red-600 flex items-center gap-1">
                          <UserX size={12} /> RASHOD
                        </span>
                      ) : (
                        toName || '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{signerName || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(t.date)}</td>
                    {workflowTab === 'pending' ? (
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${stepBadgeClass(stepBadge.tone)}`}>
                          {stepBadge.label}
                        </span>
                      </td>
                    ) : null}
                    <td
                      className="px-4 py-3 text-xs text-gray-500 max-w-[150px] truncate"
                      title={t.reason || t.notes || ''}
                    >
                      {t.reason || t.notes || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        }
      />

      {list.meta ? (
        <PaginationControls
          page={list.page}
          pageSize={list.pageSize}
          total={list.meta.total}
          totalPages={list.meta.totalPages}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
          className="rounded-b-xl border border-t-0 border-gray-100 mb-4"
        />
      ) : null}

      {selectedTransfer ? (
        <ModalRoot
          open
          onClose={() => setSelectedTransferId(null)}
          size="xl"
          panelClassName="bg-white shadow-xl max-w-3xl"
          enableEscape
          closeOnBackdrop
        >
          <div className="bg-white rounded-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Prenosnica {selectedTransfer.documentNumber}
                </h2>
                <p className="text-sm text-gray-500">
                  {getStatusLabel(selectedTransfer.type)} · {formatDate(selectedTransfer.date)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTransferId(null)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                Zatvori
              </button>
            </div>
            <TransferDocumentPanel
              transfer={selectedTransfer}
              allowSign={
                selectedTransfer.status !== 'potpisan' && selectedTransfer.status !== 'cancelled'
              }
              onSigned={handleSigned}
            />
          </div>
        </ModalRoot>
      ) : null}
    </>
  );
};
