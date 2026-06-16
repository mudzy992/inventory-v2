import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import { TransferDocumentPanel } from './TransferDocumentPanel';
import { useStore, useRefreshData } from '../useStore';
import { getEmployeeFullName, getStatusLabel, getStatusColor, formatDate, getOrgUnitPath, resolveSignerEmployee } from '../helpers';
import {
  isAdmin,
  isEvidenticar,
  getCurrentUser,
  isCrossServiceTransfer,
} from '../store';
import { createTransferApi, fetchTransferApi } from '../api/data-api';
import { fetchEquipmentPageApi } from '../api/equipment-api';
import { searchEmployeesApi } from '../api/employees-api';
import { fetchTransfersPageApi } from '../api/transfers-api';
import {
  getTransferEquipmentLabel,
  getTransferFromPersonName,
  getTransferSignerName,
  getTransferToPersonName,
} from '../helpers/transfer-display.util';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { resolveDisposalCommissionApi, type DisposalResolveDto } from '../api/disposal-api';
import { AlertBanner } from './ui/alert-banner';
import { ApiError } from '../api/client';
import { useToast } from '../contexts/toast-context';
import { Search, Filter, ArrowRight, ArrowLeftRight, Package, Warehouse, UserX, Trash2, AlertTriangle, FileText, ClipboardList } from 'lucide-react';
import { PageHeaderRow } from './ui/page-header-row';
import { PageTabs } from './ui/page-tabs';
import { usePublicSettings } from '../contexts/public-settings-context';
import { useAdminSettings } from '../contexts/admin-settings-context';
import {
  canCreateTransferType,
  canCreateCrossServiceTransfer,
  TRANSFER_GUARD_MESSAGES,
} from '../helpers/guards';
import { getApiErrorMessage, refreshAfterMutation } from '../helpers/run-mutation-with-refresh.util';
import type { TransferModuleTab } from './transfers/transfer-module-tab';
import { CurrentAssignmentsTab } from './transfers/current-assignments-tab';
import { TransferDocumentsTab } from './transfers/transfer-documents-tab';
import { ResponsiveTable } from './ui/responsive-table';
import { PaginationControls } from './ui/pagination-controls';
import { ModalRoot } from './ui/modal-root';
import type { Employee, Equipment, TransferRecord, TransferType } from '../types';
import { buildTransferCreatePayload } from '../helpers/create-transfer-payload.util';
import {
  InventoryFreezeActionHint,
  useInventoryFreezeActive,
} from './inventory-count/inventory-freeze-action-hint';
interface TransfersPageProps {
  initialTab?: TransferModuleTab;
}

export function TransfersPage({ initialTab = 'history' }: TransfersPageProps) {
  const { getBoolean } = usePublicSettings();
  const { settings: adminSettings } = useAdminSettings();
  const documentsEnabled = getBoolean('features.documents', true);
  const [activeTab, setActiveTab] = useState<TransferModuleTab>(initialTab);
  const [state] = useStore();
  const refresh = useRefreshData();
  const [filterType, setFilterType] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);
  const [selectedTransfer, setSelectedTransfer] = useState<TransferRecord | null>(null);
  const [availableEquipment, setAvailableEquipment] = useState<Equipment[]>([]);
  const [availableEmployees, setAvailableEmployees] = useState<Employee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');

  const admin = isAdmin();
  const evidenticar = isEvidenticar();
  const user = getCurrentUser();
  const { toastError } = useToast();
  const isFrozen = useInventoryFreezeActive();
  const [disposalResolve, setDisposalResolve] = useState<DisposalResolveDto | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (activeTab === 'documents' && !documentsEnabled) {
      setActiveTab('history');
    }
  }, [activeTab, documentsEnabled]);

  const tabItems = useMemo(() => {
    const items: { id: TransferModuleTab; label: string; icon: typeof ArrowLeftRight }[] = [
      { id: 'history', label: 'Zaduženja', icon: ArrowLeftRight },
      { id: 'current', label: 'Trenutna zaduženja', icon: ClipboardList },
    ];
    if (documentsEnabled) {
      items.push({ id: 'documents', label: 'Prenosnice', icon: FileText });
    }
    return items;
  }, [documentsEnabled]);

  // Form
  const [fType, setFType] = useState<TransferType>('zaduzenje');
  const [fEquipmentId, setFEquipmentId] = useState('');
  const [fToPersonId, setFToPersonId] = useState('');
  const [fReason, setFReason] = useState('');
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10));
  const [fNotes, setFNotes] = useState('');

  const list = usePaginatedList<TransferRecord, Record<string, never>>({
    fetchPage: fetchTransfersPageApi,
    initialSortBy: 'date',
    initialSortDir: 'desc',
  });

  const search = list.search;
  const setSearch = list.setSearch;
  const filtered = useMemo(
    () => (filterType ? list.items.filter((row) => row.type === filterType) : list.items),
    [filterType, list.items],
  );

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

  useEffect(() => {
    if (!showForm) {
      return;
    }
    const status =
      fType === 'zaduzenje'
        ? 'skladiste'
        : fType === 'prenos' || fType === 'razduzenje'
          ? 'zaduzeno'
          : undefined;
    void fetchEquipmentPageApi({ page: 1, pageSize: 100, status: status as Equipment['status'] })
      .then((response) => setAvailableEquipment(response.items))
      .catch(() => setAvailableEquipment([]));
  }, [showForm, fType]);

  useEffect(() => {
    if (!showForm) {
      return;
    }
    const term = employeeSearch.trim();
    if (term.length < 2) {
      setAvailableEmployees([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void searchEmployeesApi(term)
        .then(setAvailableEmployees)
        .catch(() => setAvailableEmployees([]));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [employeeSearch, showForm]);

  const selectedEquipment = availableEquipment.find((e) => e.id === fEquipmentId);
  const selectedEquipHolder = selectedEquipment?.currentHolder ?? null;
  const selectedToEmployee = availableEmployees.find((emp) => emp.id === fToPersonId);

  useEffect(() => {
    if (!showForm || fType !== 'rashodovanje' || !fEquipmentId) {
      setDisposalResolve(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const resolved = await resolveDisposalCommissionApi(fEquipmentId);
        if (!cancelled) {
          setDisposalResolve(resolved);
        }
      } catch {
        if (!cancelled) {
          setDisposalResolve(null);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [fEquipmentId, fType, showForm]);

  // Check if this would be a cross-service transfer
  const wouldBeCrossService = useMemo(() => {
    if (fType !== 'prenos' || !selectedEquipHolder?.orgUnitId || !selectedToEmployee?.orgUnitId) {
      return false;
    }
    return isCrossServiceTransfer(selectedEquipHolder.orgUnitId, selectedToEmployee.orgUnitId);
  }, [fType, selectedEquipHolder, selectedToEmployee]);

  function openForm(type: TransferType) {
    setFType(type);
    setFEquipmentId('');
    setFToPersonId('');
    setFReason('');
    setFDate(new Date().toISOString().slice(0, 10));
    setFNotes('');
    setShowForm(true);
  }

  const handleSave = async () => {
    if (!fEquipmentId) {
      toastError('Odaberite opremu.');
      return;
    }
    const eq = selectedEquipment;
    if (!eq) return;

    const typeGuard = canCreateTransferType(fType, adminSettings);
    if (!typeGuard.allowed) {
      toastError(typeGuard.reason ?? TRANSFER_GUARD_MESSAGES.generationDisabled);
      return;
    }

    if (fType === 'prenos' && wouldBeCrossService) {
      const crossGuard = canCreateCrossServiceTransfer({
        isCrossService: true,
        isAdmin: admin,
        crossServiceEnabled: adminSettings['features.cross_service_transfer'] !== false,
      });
      if (!crossGuard.allowed) {
        toastError(crossGuard.reason ?? TRANSFER_GUARD_MESSAGES.crossServiceEvidenticar);
        return;
      }
    }

    const result = buildTransferCreatePayload({
      state,
      user,
      equipment: eq,
      type: fType,
      toPersonId: fToPersonId,
      toPersonOrgUnitId: selectedToEmployee?.orgUnitId,
      reason: fReason,
      date: fDate,
      notes: fNotes,
      admin,
      evidenticar,
      hasDisposalCommission: Boolean(disposalResolve?.commission),
    });
    if (result.error) {
      toastError(result.error);
      return;
    }
    try {
      await createTransferApi(result.payload!);
      await refreshAfterMutation([refresh, list.refresh]);
      setShowForm(false);
    } catch (err) {
      toastError(getApiErrorMessage(err, 'Greška pri kreiranju transfera'));
    }
  };

  const historyActions =
    activeTab === 'history' ? (
      <>
        <button
          type="button"
          onClick={() => openForm('zaduzenje')}
          disabled={isFrozen}
          className="flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50"
        >
          <Package size={16} /> Zaduži
        </button>
        <button
          type="button"
          onClick={() => openForm('prenos')}
          disabled={isFrozen}
          className="flex items-center gap-2 bg-orange-500 text-white px-3 py-2 rounded-lg hover:bg-orange-600 text-sm font-medium disabled:opacity-50"
        >
          <ArrowRight size={16} /> Prenos
        </button>
        <button
          type="button"
          onClick={() => openForm('razduzenje')}
          disabled={isFrozen}
          className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
        >
          <Warehouse size={16} /> Razduži
        </button>
        <button
          type="button"
          disabled
          title={TRANSFER_GUARD_MESSAGES.rashodovanjeBlocked}
          className="flex items-center gap-2 bg-red-600/50 text-white px-3 py-2 rounded-lg text-sm font-medium cursor-not-allowed opacity-60"
        >
          <Trash2 size={16} /> Rashod
        </button>
      </>
    ) : null;

  let tabContent: ReactNode = null;
  if (activeTab === 'history') {
    tabContent = (
      <>
      <InventoryFreezeActionHint />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Pretraži..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
            <option value="">Svi tipovi</option>
            <option value="zaduzenje">Zaduženje</option>
            <option value="prenos">Prenos</option>
            <option value="razduzenje">Razduženje</option>
            <option value="rashodovanje">Rashodovanje</option>
          </select>
        </div>
      </div>

      <ResponsiveTable
        isEmpty={filtered.length === 0}
        emptyMessage="Nema rezultata"
        mobile={filtered.map((t) => {
          const cat = t.equipment?.categoryId
            ? state.categories.find((c) => c.id === t.equipment!.categoryId)
            : null;
          const fromName = getTransferFromPersonName(t);
          const toName = getTransferToPersonName(t);
          return (
            <button
              key={t.id}
              type="button"
              className={`w-full text-left p-4 space-y-1 ${selectedTransferId === t.id ? 'bg-blue-50' : ''}`}
              onClick={() => setSelectedTransferId(t.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-medium text-gray-800">{t.documentNumber}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(t.status)}`}>
                  {t.status === 'raw' ? 'RAW' : 'Potpisan'}
                </span>
              </div>
              <p className={`text-xs font-semibold ${
                t.type === 'zaduzenje' ? 'text-green-600' :
                t.type === 'razduzenje' ? 'text-blue-600' :
                t.type === 'rashodovanje' ? 'text-red-600' :
                'text-orange-600'
              }`}>{getStatusLabel(t.type)}</p>
              <p className="text-xs text-gray-600">{getTransferEquipmentLabel(t)} · {cat?.name}</p>
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
                <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 font-medium text-gray-600">Razlog</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const cat = t.equipment?.categoryId
                  ? state.categories.find((c) => c.id === t.equipment!.categoryId)
                  : null;
                const fromName = getTransferFromPersonName(t);
                const toName = getTransferToPersonName(t);
                const signerName = getTransferSignerName(t);

                return (
                  <tr
                    key={t.id}
                    className={`border-t border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${
                      selectedTransferId === t.id ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => setSelectedTransferId(t.id)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-medium text-gray-800">{t.documentNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className={`text-xs font-semibold ${
                          t.type === 'zaduzenje' ? 'text-green-600' :
                          t.type === 'razduzenje' ? 'text-blue-600' :
                          t.type === 'rashodovanje' ? 'text-red-600' :
                          'text-orange-600'
                        }`}>{getStatusLabel(t.type)}</span>
                        {t.isCrossServiceTransfer && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded" title="Cross-service prenos">
                            ⚠
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-700">{getTransferEquipmentLabel(t)}</span>
                      <p className="text-[10px] text-gray-400">{cat?.name}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {t.fromType === 'skladiste' ? (
                        <span className="text-blue-600 flex items-center gap-1"><Warehouse size={12} /> Skladište</span>
                      ) : fromName || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {t.toType === 'skladiste' ? (
                        <span className="text-blue-600 flex items-center gap-1"><Warehouse size={12} /> Skladište</span>
                      ) : t.toType === 'rashod' ? (
                        <span className="text-red-600 flex items-center gap-1"><UserX size={12} /> RASHOD</span>
                      ) : toName || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {signerName || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(t.date)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(t.status)}`}>
                        {t.status === 'raw' ? 'RAW' : 'Potpisan'}
                      </span>
                      {t.disposalApproval ? (
                        <p className="text-[10px] text-amber-700 mt-0.5">
                          Rashod: {t.disposalApproval.status}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[150px] truncate" title={t.reason || t.notes || ''}>
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
        <div className="mt-4">
          <TransferDocumentPanel
            transfer={selectedTransfer}
            allowSign={selectedTransfer.status === 'raw'}
            onSigned={() => {
              void refresh();
              void list.refresh();
            }}
          />
        </div>
      ) : null}
      </>
    );
  } else if (activeTab === 'current') {
    tabContent = <CurrentAssignmentsTab />;
  } else if (activeTab === 'documents') {
    tabContent = <TransferDocumentsTab />;
  }

  return (
    <div>
      <PageHeaderRow
        title="Zaduženja"
        description="Prenosi opreme, trenutna zaduženja i prenosnice"
        actions={historyActions}
      />

      <PageTabs tabs={tabItems} activeTab={activeTab} onChange={setActiveTab} className="mb-4" />

      {tabContent}

      {/* New Transfer Modal */}
      {showForm && (
        <ModalRoot open onClose={() => setShowForm(false)} size="lg" panelClassName="bg-white shadow-xl max-w-lg">
          <div className="bg-white rounded-t-xl sm:rounded-xl w-full max-h-[90dvh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">
                {fType === 'zaduzenje' && '📦 Novo zaduženje — sa skladišta na osobu'}
                {fType === 'prenos' && '🔄 Prenos — sa osobe na osobu'}
                {fType === 'razduzenje' && '🏪 Razduženje — sa osobe na skladište'}
                {fType === 'rashodovanje' && '🗑️ Rashodovanje — otpis opreme'}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {/* Transfer type selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tip operacije</label>
                <select value={fType} onChange={e => { setFType(e.target.value as TransferType); setFEquipmentId(''); setFToPersonId(''); }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="zaduzenje">Zaduženje (skladište → osoba)</option>
                  <option value="prenos">Prenos (osoba → osoba)</option>
                  <option value="razduzenje">Razduženje (osoba → skladište)</option>
                  <option value="rashodovanje">Rashodovanje (otpis)</option>
                </select>
              </div>

              {/* Equipment selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Oprema *</label>
                <select value={fEquipmentId} onChange={e => setFEquipmentId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">— Odaberi opremu —</option>
                  {availableEquipment.map(eq => {
                    const cat = state.categories.find(c => c.id === eq.categoryId);
                    const holder = eq.currentHolder;
                    return (
                      <option key={eq.id} value={eq.id}>
                        {eq.inventoryNumber} — {cat?.name} {holder ? `[${getEmployeeFullName(holder)}]` : '[Skladište]'}
                      </option>
                    );
                  })}
                </select>
                {availableEquipment.length === 0 && (
                  <p className="text-xs text-orange-500 mt-1">Nema dostupne opreme za ovaj tip operacije.</p>
                )}
              </div>

              {/* Show from person info */}
              {selectedEquipment && selectedEquipHolder && (fType === 'prenos' || fType === 'razduzenje' || fType === 'rashodovanje') && (
                <div className="bg-blue-50 rounded-lg p-3 text-sm">
                  <span className="text-blue-700 font-medium">Trenutno zadužen na:</span>{' '}
                  <span>{getEmployeeFullName(selectedEquipHolder)}</span>
                  <p className="text-xs text-blue-500">{getOrgUnitPath(state.orgUnits, selectedEquipHolder.orgUnitId)}</p>
                </div>
              )}

              {/* To person - for zaduzenje and prenos */}
              {(fType === 'zaduzenje' || fType === 'prenos') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zadužiti na osobu *</label>
                  <input
                    type="text"
                    value={employeeSearch}
                    onChange={(e) => setEmployeeSearch(e.target.value)}
                    placeholder="Pretraži radnika (min. 2 znaka)…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <select value={fToPersonId} onChange={e => setFToPersonId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">— Odaberi osobu —</option>
                    {availableEmployees
                      .filter(e => e.id !== selectedEquipment?.currentHolderId)
                      .map(emp => {
                        const org = state.orgUnits.find(o => o.id === emp.orgUnitId);
                        return (
                          <option key={emp.id} value={emp.id}>
                            {getEmployeeFullName(emp)} — {emp.title} ({org?.name || ''})
                          </option>
                        );
                      })}
                  </select>
                  {employeeSearch.trim().length >= 2 && availableEmployees.length === 0 ? (
                    <p className="text-xs text-gray-500 mt-1">Nema rezultata pretrage.</p>
                  ) : null}
                </div>
              )}

              {/* Cross-service warning */}
              {wouldBeCrossService && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm flex items-start gap-2">
                  <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-red-800">Prenos izvan opsega!</p>
                    <p className="text-red-600 text-xs mt-0.5">
                      {admin
                        ? 'Ovo je prenos između različitih službi. Dokumentacija će biti posebno označena.'
                        : 'Prenos izvan vašeg opsega (grad/kategorija) može izvršiti samo administrator.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Signer info */}
              {fToPersonId && selectedToEmployee ? (
                <div className="bg-green-50 rounded-lg p-3 text-sm">
                  <span className="text-green-700 font-medium">Potpisnik (ovlaštena osoba):</span>{' '}
                  {(() => {
                    const signer = resolveSignerEmployee(
                      state.orgUnits,
                      availableEmployees,
                      selectedToEmployee.orgUnitId,
                    );
                    return signer ? (
                      <span>{getEmployeeFullName(signer)} — {signer.title}</span>
                    ) : (
                      <span className="text-gray-400">Nije definisan</span>
                    );
                  })()}
                </div>
              ) : null}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Datum</label>
                <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              {fType === 'rashodovanje' && evidenticar ? (
                disposalResolve?.commission ? (
                  <AlertBanner tone="info">
                    Komisija za rashod: <strong>{disposalResolve.commission.name}</strong>
                    {disposalResolve.city?.name ? ` (${disposalResolve.city.name})` : ''}
                    <ul className="mt-2 text-xs space-y-0.5">
                      {disposalResolve.commission.members.map((member) => (
                        <li key={member.employeeId}>
                          {member.employee
                            ? `${member.employee.firstName} ${member.employee.lastName}`
                            : member.employeeId}
                          {member.role === 'predsjednik' ? ' — predsjednik' : ''}
                        </li>
                      ))}
                    </ul>
                  </AlertBanner>
                ) : (
                  <AlertBanner tone="warning">
                    Nema aktivne komisije za rashod u gradu zaduženog radnika. Rashod nije moguć.
                  </AlertBanner>
                )
              ) : null}

              {(fType === 'razduzenje' || fType === 'rashodovanje') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Razlog {fType === 'rashodovanje' ? '(obavezno)' : ''}
                  </label>
                  <textarea value={fReason} onChange={e => setFReason(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    rows={2} placeholder={fType === 'rashodovanje' ? 'Razlog rashodovanja...' : 'Razlog razduženja...'} />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Napomene</label>
                <textarea value={fNotes} onChange={e => setFNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={2} />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-300 hover:bg-gray-50">Odustani</button>
              <button 
                onClick={handleSave} 
                disabled={
                  (evidenticar && !admin && wouldBeCrossService) ||
                  (fType === 'rashodovanje' && evidenticar && !disposalResolve?.commission)
                }
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Kreiraj prenos
              </button>
            </div>
          </div>
        </ModalRoot>
      )}
    </div>
  );
}
