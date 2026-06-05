import { useState, useMemo, useEffect } from 'react';
import { TransferDocumentPanel } from './TransferDocumentPanel';
import { useStore, useRefreshData } from '../useStore';
import { getSignerForEmployee, getEmployeeFullName, getStatusLabel, getStatusColor, formatDate, getOrgUnitPath } from '../helpers';
import {
  isAdmin,
  isEvidenticar,
  getCurrentUser,
  equipmentMatchesScope,
  employeeMatchesScope,
  transferMatchesScope,
  isCrossServiceTransfer,
} from '../store';
import { createTransferApi } from '../api/data-api';
import { resolveDisposalCommissionApi, type DisposalResolveDto } from '../api/disposal-api';
import { AlertBanner } from './ui/alert-banner';
import { ApiError } from '../api/client';
import { useToast } from '../contexts/toast-context';
import { Search, Filter, ArrowRight, Package, Warehouse, UserX, Trash2, AlertTriangle } from 'lucide-react';
import type { TransferType } from '../types';
import { buildTransferCreatePayload } from '../helpers/create-transfer-payload.util';
import {
  InventoryFreezeActionHint,
  useInventoryFreezeActive,
} from './inventory-count/inventory-freeze-action-hint';
import type { PageId } from './page-id';
import { PageHeaderRow } from './ui/page-header-row';
import { ResponsiveTable } from './ui/responsive-table';

interface TransfersPageProps {
  onNavigate?: (page: PageId) => void;
}

export function TransfersPage({ onNavigate }: TransfersPageProps) {
  const [state] = useStore();
  const refresh = useRefreshData();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);

  const admin = isAdmin();
  const evidenticar = isEvidenticar();
  const user = getCurrentUser();
  const { toastError } = useToast();
  const isFrozen = useInventoryFreezeActive();
  const [disposalResolve, setDisposalResolve] = useState<DisposalResolveDto | null>(null);

  // Form
  const [fType, setFType] = useState<TransferType>('zaduzenje');
  const [fEquipmentId, setFEquipmentId] = useState('');
  const [fToPersonId, setFToPersonId] = useState('');
  const [fReason, setFReason] = useState('');
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10));
  const [fNotes, setFNotes] = useState('');

  // Filter transfers based on role
  const relevantTransfers = useMemo(() => {
    if (admin) return state.transfers;
    if (!evidenticar) return [];
    return state.transfers.filter((row) => transferMatchesScope(row, state, user));
  }, [state, admin, evidenticar, user]);

  const filtered = useMemo(() => {
    return [...relevantTransfers]
      .sort((a, b) => b.date.localeCompare(a.date) || b.documentNumber.localeCompare(a.documentNumber))
      .filter(t => {
        const eq = state.equipment.find(e => e.id === t.equipmentId);
        const from = t.fromPersonId ? state.employees.find(e => e.id === t.fromPersonId) : null;
        const to = t.toPersonId ? state.employees.find(e => e.id === t.toPersonId) : null;
        const searchStr = `${eq?.inventoryNumber || ''} ${from ? getEmployeeFullName(from) : ''} ${to ? getEmployeeFullName(to) : ''} ${t.documentNumber} ${t.reason || ''}`.toLowerCase();
        const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
        const matchType = filterType === '' || t.type === filterType;
        return matchSearch && matchType;
      });
  }, [relevantTransfers, state, search, filterType]);

  // Available equipment for the selected transfer type
  const availableEquipment = useMemo(() => {
    let equipment = state.equipment;
    
    // For evidenticar, filter equipment
    if (evidenticar && !admin) {
      equipment = equipment.filter((row) => equipmentMatchesScope(row, state, user));
    }
    
    if (fType === 'zaduzenje') {
      return equipment.filter(e => e.status === 'skladiste');
    } else if (fType === 'prenos') {
      return equipment.filter(e => e.status === 'zaduzeno');
    } else if (fType === 'razduzenje') {
      return equipment.filter(e => e.status === 'zaduzeno');
    } else if (fType === 'rashodovanje') {
      return equipment.filter(e => e.status === 'skladiste' || e.status === 'zaduzeno');
    }
    return [];
  }, [state, fType, admin, evidenticar, user]);

  // Available employees for transfer
  const availableEmployees = useMemo(() => {
    if (admin) return state.employees;
    if (evidenticar) {
      return state.employees.filter((row) => employeeMatchesScope(row, state, user));
    }
    return [];
  }, [state.employees, admin, evidenticar, user, state]);

  const selectedEquipment = state.equipment.find(e => e.id === fEquipmentId);
  const selectedEquipHolder = selectedEquipment?.currentHolderId
    ? state.employees.find(e => e.id === selectedEquipment.currentHolderId)
    : null;

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
    if (fType !== 'prenos' || !selectedEquipment?.currentHolderId || !fToPersonId) return false;
    return isCrossServiceTransfer(selectedEquipment.currentHolderId, fToPersonId);
  }, [fType, selectedEquipment, fToPersonId]);

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
    const eq = state.equipment.find((e) => e.id === fEquipmentId);
    if (!eq) return;

    const result = buildTransferCreatePayload({
      state,
      user,
      equipment: eq,
      type: fType,
      toPersonId: fToPersonId,
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
      await refresh();
      setShowForm(false);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška pri kreiranju transfera';
      toastError(message);
    }
  };

  return (
    <div>
      <PageHeaderRow
        title="Zaduženja i prenosi"
        description="Upravljanje kretanjem opreme — zaduženja, razduženja, rashod"
        actions={
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
              onClick={() => openForm('rashodovanje')}
              disabled={isFrozen}
              className="flex items-center gap-2 bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50"
            >
              <Trash2 size={16} /> Rashod
            </button>
          </>
        }
      />

      <InventoryFreezeActionHint onOpenInventory={onNavigate} />

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
          const eq = state.equipment.find(e => e.id === t.equipmentId);
          const cat = eq ? state.categories.find(c => c.id === eq.categoryId) : null;
          const from = t.fromPersonId ? state.employees.find(e => e.id === t.fromPersonId) : null;
          const to = t.toPersonId ? state.employees.find(e => e.id === t.toPersonId) : null;
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
              <p className="text-xs text-gray-600">{eq?.inventoryNumber} · {cat?.name}</p>
              <p className="text-xs text-gray-500">{formatDate(t.date)}</p>
              <p className="text-xs text-gray-500 truncate">
                {t.fromType === 'skladiste' ? 'Skladište' : from ? getEmployeeFullName(from) : '—'}
                {' → '}
                {t.toType === 'skladiste' ? 'Skladište' : t.toType === 'rashod' ? 'RASHOD' : to ? getEmployeeFullName(to) : '—'}
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
                const eq = state.equipment.find(e => e.id === t.equipmentId);
                const cat = eq ? state.categories.find(c => c.id === eq.categoryId) : null;
                const from = t.fromPersonId ? state.employees.find(e => e.id === t.fromPersonId) : null;
                const to = t.toPersonId ? state.employees.find(e => e.id === t.toPersonId) : null;
                const signer = state.employees.find(e => e.id === t.signerId);

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
                      <span className="text-xs text-gray-700">{eq?.inventoryNumber}</span>
                      <p className="text-[10px] text-gray-400">{cat?.name}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {t.fromType === 'skladiste' ? (
                        <span className="text-blue-600 flex items-center gap-1"><Warehouse size={12} /> Skladište</span>
                      ) : from ? getEmployeeFullName(from) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {t.toType === 'skladiste' ? (
                        <span className="text-blue-600 flex items-center gap-1"><Warehouse size={12} /> Skladište</span>
                      ) : t.toType === 'rashod' ? (
                        <span className="text-red-600 flex items-center gap-1"><UserX size={12} /> RASHOD</span>
                      ) : to ? getEmployeeFullName(to) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {signer ? getEmployeeFullName(signer) : '—'}
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

      {selectedTransferId && (() => {
        const selected = state.transfers.find((t) => t.id === selectedTransferId);
        if (!selected) {
          return null;
        }
        return (
          <div className="mt-4">
            <TransferDocumentPanel
              transfer={selected}
              allowSign={selected.status === 'raw'}
              onSigned={() => void refresh()}
            />
          </div>
        );
      })()}

      {/* New Transfer Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
                    const holder = eq.currentHolderId ? state.employees.find(e => e.id === eq.currentHolderId) : null;
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
                  {evidenticar && !admin && availableEmployees.length < state.employees.length && (
                    <p className="text-xs text-purple-500 mt-1">
                      Prikazani su samo radnici u gradovima iz vaših dodjela.
                    </p>
                  )}
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
              {fToPersonId && (
                <div className="bg-green-50 rounded-lg p-3 text-sm">
                  <span className="text-green-700 font-medium">Potpisnik (ovlaštena osoba):</span>{' '}
                  {(() => {
                    const signer = getSignerForEmployee(state, fToPersonId);
                    return signer ? (
                      <span>{getEmployeeFullName(signer)} — {signer.title}</span>
                    ) : <span className="text-gray-400">Nije definisan</span>;
                  })()}
                </div>
              )}

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
        </div>
      )}
    </div>
  );
}
