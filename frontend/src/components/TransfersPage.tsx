import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import { useStore, useRefreshData } from '../useStore';
import { getEmployeeFullName, getOrgUnitPath, getSignerIdForOrgUnit } from '../helpers';
import {
  isAdmin,
  isEvidenticar,
  isModerator,
  getCurrentUser,
  isCrossServiceTransfer,
} from '../store';
import { createTransferApi } from '../api/data-api';
import { fetchEmployeeApi } from '../api/employees-api';
import { useToast } from '../contexts/toast-context';
import { Package, ArrowRight, ArrowLeftRight, Warehouse, AlertTriangle, FileText, ClipboardList } from 'lucide-react';
import { PageHeaderRow } from './ui/page-header-row';
import { PageTabs } from './ui/page-tabs';
import { usePublicSettings } from '../contexts/public-settings-context';
import { useAdminSettings } from '../contexts/admin-settings-context';
import {
  canPerformEquipmentTransfer,
  willGenerateTransferDocument,
  canCreateCrossServiceTransfer,
  TRANSFER_GUARD_MESSAGES,
} from '../helpers/guards';
import { getApiErrorMessage, refreshAfterMutation } from '../helpers/run-mutation-with-refresh.util';
import type { TransferModuleTab } from './transfers/transfer-module-tab';
import { CurrentAssignmentsTab } from './transfers/current-assignments-tab';
import { TransferDocumentsTab } from './transfers/transfer-documents-tab';
import { TransferHistoryTab } from './transfers/transfer-history-tab';
import { ModalRoot } from './ui/modal-root';
import type { Employee, Equipment, TransferType } from '../types';
import { buildTransferCreatePayload } from '../helpers/create-transfer-payload.util';
import {
  InventoryFreezeActionHint,
  useInventoryFreezeActive,
} from './inventory-count/inventory-freeze-action-hint';
import { EmployeeAutocomplete } from './employee-autocomplete';
import { EquipmentAutocomplete } from './equipment-autocomplete';

interface TransfersPageProps {
  initialTab?: TransferModuleTab;
}

export function TransfersPage({ initialTab = 'history' }: TransfersPageProps) {
  const { getBoolean } = usePublicSettings();
  const { settings: adminSettings } = useAdminSettings();
  const documentsEnabled = getBoolean('features.documents', true);
  const transferSettings = useMemo(
    () => ({
      'features.transfers': getBoolean('features.transfers', true),
      ...adminSettings,
    }),
    [adminSettings, getBoolean],
  );
  const [activeTab, setActiveTab] = useState<TransferModuleTab>(initialTab);
  const [state] = useStore();
  const refresh = useRefreshData();
  const [showForm, setShowForm] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [selectedToEmployee, setSelectedToEmployee] = useState<Employee | null>(null);
  const [signerEmployee, setSignerEmployee] = useState<Employee | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const admin = isAdmin();
  const evidenticar = isEvidenticar();
  const moderator = isModerator();
  const canManageTransfers = admin || evidenticar || moderator;
  const user = getCurrentUser();
  const { toastError } = useToast();
  const isFrozen = useInventoryFreezeActive();

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

  const [fType, setFType] = useState<TransferType>('zaduzenje');
  const [fEquipmentId, setFEquipmentId] = useState('');
  const [fToPersonId, setFToPersonId] = useState('');
  const [fReason, setFReason] = useState('');
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10));
  const [fNotes, setFNotes] = useState('');

  const equipmentStatus = useMemo(
    () =>
      fType === 'zaduzenje'
        ? ('skladiste' as const)
        : fType === 'prenos' || fType === 'razduzenje'
          ? ('zaduzeno' as const)
          : undefined,
    [fType],
  );

  const selectedEquipHolder = selectedEquipment?.currentHolder ?? null;

  const excludeHolderIds = useMemo(() => {
    const holderId = selectedEquipment?.currentHolderId;
    return holderId ? new Set([holderId]) : undefined;
  }, [selectedEquipment?.currentHolderId]);

  useEffect(() => {
    if (!selectedToEmployee) {
      setSignerEmployee(null);
      return;
    }
    const signerId = getSignerIdForOrgUnit(state.orgUnits, selectedToEmployee.orgUnitId);
    if (!signerId) {
      setSignerEmployee(null);
      return;
    }
    let cancelled = false;
    void fetchEmployeeApi(signerId)
      .then((employee) => {
        if (!cancelled) {
          setSignerEmployee(employee);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSignerEmployee(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedToEmployee, state.orgUnits]);

  const wouldBeCrossService = useMemo(() => {
    if (fType !== 'prenos' || !selectedEquipHolder?.orgUnitId || !selectedToEmployee?.orgUnitId) {
      return false;
    }
    return isCrossServiceTransfer(selectedEquipHolder.orgUnitId, selectedToEmployee.orgUnitId);
  }, [fType, selectedEquipHolder, selectedToEmployee]);

  const openForm = (type: TransferType) => {
    setFType(type);
    setFEquipmentId('');
    setSelectedEquipment(null);
    setFToPersonId('');
    setSelectedToEmployee(null);
    setSignerEmployee(null);
    setFReason('');
    setFDate(new Date().toISOString().slice(0, 10));
    setFNotes('');
    setShowForm(true);
  };

  const refreshHistory = useCallback(() => {
    setHistoryRefreshKey((key) => key + 1);
  }, []);

  const handleSave = async () => {
    if (!fEquipmentId) {
      toastError('Odaberite opremu.');
      return;
    }
    const eq = selectedEquipment;
    if (!eq) {
      return;
    }

    const typeGuard = canPerformEquipmentTransfer(fType, transferSettings);
    if (!typeGuard.allowed) {
      toastError(typeGuard.reason ?? TRANSFER_GUARD_MESSAGES.transfersDisabled);
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
    });
    if (result.error) {
      toastError(result.error);
      return;
    }
    try {
      await createTransferApi(result.payload!);
      await refreshAfterMutation([refresh, refreshHistory]);
      setShowForm(false);
    } catch (err) {
      toastError(getApiErrorMessage(err, 'Greška pri kreiranju transfera'));
    }
  };

  const historyActions =
    activeTab === 'history' && canManageTransfers ? (
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
      </>
    ) : null;

  let tabContent: ReactNode = null;
  if (activeTab === 'history') {
    tabContent = <TransferHistoryTab key={historyRefreshKey} />;
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

      {showForm && equipmentStatus ? (
        <ModalRoot open onClose={() => setShowForm(false)} size="lg" panelClassName="bg-white shadow-xl max-w-lg" enableEscape closeOnBackdrop>
          <div className="bg-white rounded-t-xl sm:rounded-xl w-full max-h-[90dvh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">
                {fType === 'zaduzenje' && 'Novo zaduženje — sa skladišta na osobu'}
                {fType === 'prenos' && 'Prenos — sa osobe na osobu'}
                {fType === 'razduzenje' && 'Razduženje — sa osobe na skladište'}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <InventoryFreezeActionHint />
              {!willGenerateTransferDocument(fType, transferSettings) && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Prenosnica se neće generisati — oprema se prenosi odmah bez dokumenta i potpisa.
                </p>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tip operacije</label>
                <select
                  value={fType}
                  onChange={(e) => {
                    setFType(e.target.value as TransferType);
                    setFEquipmentId('');
                    setSelectedEquipment(null);
                    setFToPersonId('');
                    setSelectedToEmployee(null);
                    setSignerEmployee(null);
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="zaduzenje">Zaduženje (skladište → osoba)</option>
                  <option value="prenos">Prenos (osoba → osoba)</option>
                  <option value="razduzenje">Razduženje (osoba → skladište)</option>
                </select>
              </div>

              <div>
                <label htmlFor="transfer-equipment" className="block text-sm font-medium text-gray-700 mb-1">
                  Oprema *
                </label>
                <EquipmentAutocomplete
                  id="transfer-equipment"
                  categories={state.categories}
                  status={equipmentStatus}
                  value={fEquipmentId}
                  required
                  onChange={(equipmentId, equipment) => {
                    setFEquipmentId(equipmentId);
                    setSelectedEquipment(equipment);
                  }}
                />
              </div>

              {selectedEquipment && selectedEquipHolder && (fType === 'prenos' || fType === 'razduzenje') ? (
                <div className="bg-blue-50 rounded-lg p-3 text-sm">
                  <span className="text-blue-700 font-medium">Trenutno zadužen na:</span>{' '}
                  <span>{getEmployeeFullName(selectedEquipHolder)}</span>
                  <p className="text-xs text-blue-500">
                    {getOrgUnitPath(state.orgUnits, selectedEquipHolder.orgUnitId)}
                  </p>
                </div>
              ) : null}

              {(fType === 'zaduzenje' || fType === 'prenos') && (
                <div>
                  <label htmlFor="transfer-to-person" className="block text-sm font-medium text-gray-700 mb-1">
                    Zadužiti na osobu *
                  </label>
                  <EmployeeAutocomplete
                    id="transfer-to-person"
                    orgUnits={state.orgUnits}
                    value={fToPersonId}
                    excludeIds={excludeHolderIds}
                    required
                    onChange={(employeeId, employee) => {
                      setFToPersonId(employeeId);
                      setSelectedToEmployee(employee);
                    }}
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Prikaz: ime · pozicija · org. putanja. Pri kucanju: pretraga po imenu, poziciji ili emailu.
                  </p>
                </div>
              )}

              {wouldBeCrossService ? (
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
              ) : null}

              {fToPersonId && selectedToEmployee ? (
                <div className="bg-green-50 rounded-lg p-3 text-sm">
                  <span className="text-green-700 font-medium">Potpisnik (ovlaštena osoba):</span>{' '}
                  {signerEmployee ? (
                    <span>
                      {getEmployeeFullName(signerEmployee)} — {signerEmployee.title}
                    </span>
                  ) : (
                    <span className="text-gray-400">Nije definisan</span>
                  )}
                </div>
              ) : null}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Datum</label>
                <input
                  type="date"
                  value={fDate}
                  onChange={(e) => setFDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {fType === 'razduzenje' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Razlog</label>
                  <textarea
                    value={fReason}
                    onChange={(e) => setFReason(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    rows={2}
                    placeholder="Razlog razduženja..."
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Napomene</label>
                <textarea
                  value={fNotes}
                  onChange={(e) => setFNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={2}
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                Odustani
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={evidenticar && !admin && wouldBeCrossService}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Kreiraj prenos
              </button>
            </div>
          </div>
        </ModalRoot>
      ) : null}
    </div>
  );
}
