import { useCallback, useEffect, useMemo, useState } from 'react';
import { Save, Search, FileText, X } from 'lucide-react';
import {
  recordInventoryLineApi,
  type InventoryLineDto,
  type InventoryLineStatus,
  type InventoryRelocationTarget,
  type InventorySessionDto,
} from '../../api/inventory-api';
import { fetchTransferApi } from '../../api/data-api';
import { ApiError } from '../../api/client';
import { getEmployeeFullName, getOrgUnitPath } from '../../helpers';
import { useToast } from '../../contexts/toast-context';
import { useStore } from '../../useStore';
import type { Equipment, TransferRecord } from '../../types';
import { AlertBanner } from '../ui/alert-banner';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { TransferDocumentPanel } from '../TransferDocumentPanel';
import { cardClass, inputClass, selectClass } from '../ui/form-styles';
import { cn } from '../../utils/cn';
import { INVENTORY_LINE_STATUS_OPTIONS, getInventoryLineStatusLabel } from './inventory-labels';
import { isLineUnrecorded, isTransferPending } from './inventory-session-stats.util';

interface SessionLinesPanelProps {
  committeeId: string;
  isCommitteeClosed?: boolean;
  session: InventorySessionDto;
  lines: InventoryLineDto[];
  equipment: Equipment[];
  onLineSaved: () => Promise<void>;
}

interface LineDraft {
  status: InventoryLineStatus;
  note: string;
  relocationTargetType: InventoryRelocationTarget | '';
  relocationToPersonId: string;
}

type LineFilter = 'all' | 'unrecorded' | 'transfer_pending' | 'failed';

const buildDraftFromLine = (line?: InventoryLineDto): LineDraft => ({
  status: line?.status ?? 'prisutna',
  note: line?.note ?? '',
  relocationTargetType: line?.relocationTargetType ?? '',
  relocationToPersonId: line?.relocationToPersonId ?? '',
});

const FILTER_OPTIONS: { id: LineFilter; label: string }[] = [
  { id: 'all', label: 'Sve' },
  { id: 'unrecorded', label: 'Samo neevidentirano' },
  { id: 'transfer_pending', label: 'Čeka prenosnicu' },
  { id: 'failed', label: 'Greška primjene' },
];

export const SessionLinesPanel = ({
  committeeId,
  isCommitteeClosed = false,
  session,
  lines,
  equipment,
  onLineSaved,
}: SessionLinesPanelProps) => {
  const [state] = useStore();
  const { toastError } = useToast();
  const [search, setSearch] = useState('');
  const [lineFilter, setLineFilter] = useState<LineFilter>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [transferById, setTransferById] = useState<Record<string, TransferRecord>>({});
  const [loadingTransferId, setLoadingTransferId] = useState<string | null>(null);
  const [transferSheetEquipmentId, setTransferSheetEquipmentId] = useState<string | null>(null);
  const lineByEquipment = useMemo(() => {
    const map = new Map<string, InventoryLineDto>();
    for (const line of lines) {
      map.set(line.equipmentId, line);
    }
    return map;
  }, [lines]);
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  useEffect(() => {
    const next: Record<string, LineDraft> = {};
    for (const item of equipment) {
      next[item.id] = buildDraftFromLine(lineByEquipment.get(item.id));
    }
    setDrafts(next);
  }, [equipment, committeeId, lineByEquipment]);
  const progressStats = useMemo(() => {
    const transferPendingCount = lines.filter((line) => isTransferPending(line)).length;
    const failedCount = lines.filter((line) => line.pendingAction?.status === 'failed').length;
    const unrecordedCount = equipment.filter((item) => isLineUnrecorded(item.id, lineByEquipment)).length;
    return { transferPendingCount, failedCount, unrecordedCount };
  }, [equipment, lineByEquipment, lines]);
  const searched = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return equipment;
    }
    return equipment.filter((item) => {
      const holder = item.currentHolderId
        ? state.employees.find((employee) => employee.id === item.currentHolderId)
        : undefined;
      const category = state.categories.find((row) => row.id === item.categoryId);
      const haystack = [
        item.inventoryNumber,
        category?.name,
        holder ? getEmployeeFullName(holder) : '',
        holder ? getOrgUnitPath(state.orgUnits, holder.orgUnitId) : '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [equipment, search, state.categories, state.employees, state.orgUnits]);
  const filtered = useMemo(() => {
    return searched.filter((item) => {
      const savedLine = lineByEquipment.get(item.id);
      if (lineFilter === 'unrecorded') {
        return isLineUnrecorded(item.id, lineByEquipment);
      }
      if (lineFilter === 'transfer_pending') {
        return savedLine ? isTransferPending(savedLine) : false;
      }
      if (lineFilter === 'failed') {
        return savedLine?.pendingAction?.status === 'failed';
      }
      return true;
    });
  }, [lineByEquipment, lineFilter, searched]);
  const recordedCount = lines.length;
  const isReadOnly = session.status === 'closed';
  const canEdit = session.status === 'active' && !isCommitteeClosed;
  const loadTransfer = useCallback(
    async (transferId: string) => {
      if (transferById[transferId]) {
        return transferById[transferId];
      }
      setLoadingTransferId(transferId);
      try {
        const row = await fetchTransferApi(transferId);
        setTransferById((prev) => ({ ...prev, [transferId]: row }));
        return row;
      } catch (err) {
        toastError(err instanceof ApiError ? err.message : 'Greška pri učitavanju prenosnice');
        return null;
      } finally {
        setLoadingTransferId(null);
      }
    },
    [transferById],
  );
  const handleDraftChange = (equipmentId: string, patch: Partial<LineDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [equipmentId]: { ...prev[equipmentId], ...patch },
    }));
  };
  const handleSaveLine = async (item: Equipment) => {
    const draft = drafts[item.id] ?? buildDraftFromLine(lineByEquipment.get(item.id));
    if (draft.status === 'ostecena' && !draft.note.trim()) {
      toastError('Napomena je obavezna za oštećenu opremu.');
      return;
    }
    if (draft.status === 'nije_prisutna' && !draft.note.trim()) {
      toastError('Napomena je obavezna za opremu koja nije prisutna.');
      return;
    }
    if (draft.status === 'predlozen_rashod' && !draft.note.trim()) {
      toastError('Napomena je obavezna za predloženi rashod.');
      return;
    }
    if (draft.status === 'predlozen_rashod' && item.status !== 'skladiste') {
      toastError('Rashod je moguć samo za opremu na skladištu (prvo razdužite).');
      return;
    }
    if (draft.status === 'promjena_lokacije') {
      if (!draft.relocationTargetType) {
        toastError('Odaberite cilj prenosa (skladište ili osoba).');
        return;
      }
      if (draft.relocationTargetType === 'osoba' && !draft.relocationToPersonId) {
        toastError('Odaberite osobu.');
        return;
      }
    }
    setSavingId(item.id);
    try {
      await recordInventoryLineApi(committeeId, {
        equipmentId: item.id,
        status: draft.status,
        note: draft.note.trim() || undefined,
        ...(draft.status === 'promjena_lokacije'
          ? {
              relocationTargetType: draft.relocationTargetType as InventoryRelocationTarget,
              relocationToPersonId:
                draft.relocationTargetType === 'osoba' ? draft.relocationToPersonId : undefined,
            }
          : {}),
      });
      await onLineSaved();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri snimanju linije');
    } finally {
      setSavingId(null);
    }
  };
  const renderLineFields = (item: Equipment) => {
    const holder = item.currentHolderId
      ? state.employees.find((employee) => employee.id === item.currentHolderId)
      : undefined;
    const category = state.categories.find((row) => row.id === item.categoryId);
    const savedLine = lineByEquipment.get(item.id);
    const draft = drafts[item.id] ?? buildDraftFromLine(savedLine);
    const actionStatus = savedLine?.pendingAction?.status ?? null;
    const canEditThisRow =
      canEdit &&
      (actionStatus === null ||
        actionStatus === 'pending' ||
        actionStatus === 'failed' ||
        actionStatus === 'skipped');
    const transferPending = savedLine ? isTransferPending(savedLine) : false;
    const transferId = savedLine?.generatedTransfer?.id ?? null;
    return (
      <div key={item.id} className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-mono text-sm font-medium text-gray-900">{item.inventoryNumber}</p>
            <p className="text-xs text-gray-500">{category?.name ?? '—'}</p>
            <p className="text-xs text-gray-600 mt-0.5">
              {holder ? getEmployeeFullName(holder) : 'Skladište'}
            </p>
          </div>
          {savedLine ? (
            <div className="flex flex-wrap gap-1">
              {actionStatus ? (
                <Badge
                  tone={
                    actionStatus === 'applied'
                      ? 'success'
                      : actionStatus === 'failed'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {actionStatus === 'failed' ? 'Neuspješno' : actionStatus === 'applied' ? 'Primijenjeno' : 'Pending'}
                </Badge>
              ) : (
                <Badge tone={transferPending ? 'warning' : 'success'}>
                  {transferPending ? 'Čeka prenosnicu' : 'Evidentirano'}
                </Badge>
              )}
            </div>
          ) : (
            <Badge tone="info">Neevidentirano</Badge>
          )}
        </div>
        <fieldset disabled={!canEditThisRow || isReadOnly} className="space-y-2">
          <legend className="sr-only">Status linije</legend>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Status opreme">
            {INVENTORY_LINE_STATUS_OPTIONS.map((status) => (
              <label
                key={status}
                className={cn(
                  'text-xs px-2 py-1 rounded-full border cursor-pointer',
                  draft.status === status
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200',
                )}
              >
                <input
                  type="radio"
                  name={`status-${item.id}`}
                  value={status}
                  checked={draft.status === status}
                  className="sr-only"
                  onChange={() =>
                    handleDraftChange(item.id, {
                      status,
                      relocationTargetType: '',
                      relocationToPersonId: '',
                    })
                  }
                />
                {getInventoryLineStatusLabel(status)}
              </label>
            ))}
          </div>
          {draft.status === 'predlozen_rashod' ? (
            <p className="text-xs text-gray-500">
              Rashod odobrava komisija rashoda nakon zatvaranja sesije.
              {item.status !== 'skladiste' ? ' Oprema mora biti na skladištu — prvo razdužite.' : ''}
            </p>
          ) : null}
          {draft.status === 'promjena_lokacije' ? (
            <div className="space-y-2">
              <select
                value={draft.relocationTargetType}
                onChange={(event) =>
                  handleDraftChange(item.id, {
                    relocationTargetType: event.target.value as InventoryRelocationTarget | '',
                    relocationToPersonId: '',
                  })
                }
                className={selectClass}
              >
                <option value="">Cilj prenosa</option>
                <option value="skladiste">Na skladište</option>
                <option value="osoba">Na drugu osobu</option>
              </select>
              {draft.relocationTargetType === 'osoba' ? (
                <select
                  value={draft.relocationToPersonId}
                  onChange={(event) =>
                    handleDraftChange(item.id, { relocationToPersonId: event.target.value })
                  }
                  className={selectClass}
                >
                  <option value="">Osoba</option>
                  {state.employees
                    .filter((employee) => employee.id !== item.currentHolderId)
                    .map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {getEmployeeFullName(employee)}
                      </option>
                    ))}
                </select>
              ) : null}
            </div>
          ) : null}
          <input
            value={draft.note}
            onChange={(event) => handleDraftChange(item.id, { note: event.target.value })}
            placeholder={
              draft.status === 'ostecena' ||
              draft.status === 'nije_prisutna' ||
              draft.status === 'predlozen_rashod'
                ? 'Obavezna napomena'
                : 'Napomena'
            }
            className={inputClass}
          />
        </fieldset>
        <div className="flex flex-wrap gap-2">
          {canEditThisRow && !isReadOnly ? (
            <Button
              variant="secondary"
              disabled={savingId === item.id}
              onClick={() => void handleSaveLine(item)}
            >
              <Save size={14} />
              {savingId === item.id ? '…' : 'Sačuvaj'}
            </Button>
          ) : null}
          {savedLine?.generatedTransfer && transferId ? (
            <Button
              variant="secondary"
              onClick={() => {
                setTransferSheetEquipmentId(item.id);
                void loadTransfer(transferId);
              }}
            >
              <FileText size={14} />
              Prenosnica
            </Button>
          ) : null}
        </div>
      </div>
    );
  };
  const sheetItem = transferSheetEquipmentId
    ? equipment.find((row) => row.id === transferSheetEquipmentId)
    : null;
  const sheetLine = sheetItem ? lineByEquipment.get(sheetItem.id) : undefined;
  const sheetTransferId = sheetLine?.generatedTransfer?.id ?? null;
  const sheetTransfer = sheetTransferId ? transferById[sheetTransferId] : undefined;
  return (
    <div className={`${cardClass} overflow-hidden`}>
      <div className="p-4 border-b border-gray-100 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <h2 className="font-medium text-gray-900">Unos linija popisa</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {recordedCount}/{equipment.length} evidentirano
              {progressStats.transferPendingCount > 0
                ? ` · ${progressStats.transferPendingCount} prenosnica čeka upload`
                : ''}
              {progressStats.failedCount > 0 ? ` · ${progressStats.failedCount} grešaka` : ''}
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pretraga inventurnog broja…"
              className={`${inputClass} pl-9`}
              aria-label="Pretraga opreme u popisu"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filteri linija">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setLineFilter(option.id)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full border transition-colors',
                lineFilter === option.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
              )}
            >
              {option.label}
              {option.id === 'unrecorded' && progressStats.unrecordedCount > 0
                ? ` (${progressStats.unrecordedCount})`
                : ''}
            </button>
          ))}
        </div>
      </div>
      {!canEdit && !isReadOnly ? (
        <div className="p-4">
          <AlertBanner tone="warning">
            Aktivirajte sesiju prije unosa linija. Dok je sesija nacrt, unos nije moguć.
          </AlertBanner>
        </div>
      ) : null}
      {isReadOnly ? (
        <div className="p-4">
          <AlertBanner tone="success">Sesija je zatvorena — pregled samo za čitanje.</AlertBanner>
        </div>
      ) : null}
      {isCommitteeClosed && !isReadOnly ? (
        <div className="p-4">
          <AlertBanner tone="success">Lista komisije je zaključana — pregled samo za čitanje.</AlertBanner>
        </div>
      ) : null}
      <div className="md:hidden divide-y divide-gray-100">
        {filtered.map((item) => (
          <div key={item.id} className="p-4">
            {renderLineFields(item)}
          </div>
        ))}
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-gray-400 text-sm">Nema stavki za odabrani filter.</p>
        ) : null}
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Inventurni broj</th>
              <th className="text-left px-4 py-2 font-medium">Kategorija</th>
              <th className="text-left px-4 py-2 font-medium">Zaduženje</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium">Napomena</th>
              <th className="text-left px-4 py-2 font-medium w-28">Akcija</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const holder = item.currentHolderId
                ? state.employees.find((employee) => employee.id === item.currentHolderId)
                : undefined;
              const category = state.categories.find((row) => row.id === item.categoryId);
              const savedLine = lineByEquipment.get(item.id);
              const draft = drafts[item.id] ?? buildDraftFromLine(savedLine);
              const actionStatus = savedLine?.pendingAction?.status ?? null;
              const canEditThisRow =
                canEdit &&
                (actionStatus === null ||
                  actionStatus === 'pending' ||
                  actionStatus === 'failed' ||
                  actionStatus === 'skipped');
              const transferPending = savedLine ? isTransferPending(savedLine) : false;
              const transferId = savedLine?.generatedTransfer?.id ?? null;
              const transferRecord = transferId ? transferById[transferId] : undefined;
              const lineApplied = actionStatus === 'applied';
              return (
                <tr key={item.id} className="border-t border-gray-100 align-top">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-800">
                    {item.inventoryNumber}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{category?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {holder ? (
                      <>
                        <span className="font-medium text-gray-800">{getEmployeeFullName(holder)}</span>
                        <p className="text-gray-400 mt-0.5">{getOrgUnitPath(state.orgUnits, holder.orgUnitId)}</p>
                      </>
                    ) : (
                      <span>Skladište</span>
                    )}
                  </td>
                  <td className="px-4 py-3 space-y-2 min-w-[220px]">
                    <select
                      value={draft.status}
                      disabled={!canEditThisRow || isReadOnly}
                      onChange={(event) =>
                        handleDraftChange(item.id, {
                          status: event.target.value as InventoryLineStatus,
                          relocationTargetType: '',
                          relocationToPersonId: '',
                        })
                      }
                      className={selectClass}
                    >
                      {INVENTORY_LINE_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {getInventoryLineStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                    {draft.status === 'predlozen_rashod' ? (
                      <p className="text-[11px] text-gray-500">
                        Odobrenje komisije rashoda nakon zatvaranja sesije.
                      </p>
                    ) : null}
                    {draft.status === 'promjena_lokacije' ? (
                      <div className="space-y-2">
                        <select
                          value={draft.relocationTargetType}
                          disabled={!canEditThisRow || isReadOnly}
                          onChange={(event) =>
                            handleDraftChange(item.id, {
                              relocationTargetType: event.target.value as InventoryRelocationTarget | '',
                              relocationToPersonId: '',
                            })
                          }
                          className={selectClass}
                        >
                          <option value="">Cilj prenosa</option>
                          <option value="skladiste">Na skladište</option>
                          <option value="osoba">Na drugu osobu</option>
                        </select>
                        {draft.relocationTargetType === 'osoba' ? (
                          <select
                            value={draft.relocationToPersonId}
                            disabled={!canEditThisRow || isReadOnly}
                            onChange={(event) =>
                              handleDraftChange(item.id, { relocationToPersonId: event.target.value })
                            }
                            className={selectClass}
                          >
                            <option value="">Osoba</option>
                            {state.employees
                              .filter((employee) => employee.id !== item.currentHolderId)
                              .map((employee) => (
                                <option key={employee.id} value={employee.id}>
                                  {getEmployeeFullName(employee)}
                                </option>
                              ))}
                          </select>
                        ) : null}
                      </div>
                    ) : null}
                    {savedLine ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {actionStatus ? (
                          <Badge tone={actionStatus === 'failed' ? 'danger' : actionStatus === 'applied' ? 'success' : 'warning'}>
                            {actionStatus === 'failed' ? 'Neuspješno' : actionStatus === 'applied' ? 'Primijenjeno' : 'Pending'}
                          </Badge>
                        ) : (
                          <Badge tone={transferPending ? 'warning' : 'success'}>
                            {transferPending ? 'Čeka prenosnicu' : 'Evidentirano'}
                          </Badge>
                        )}
                        {savedLine.generatedTransfer && transferId ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs text-gray-700 hover:text-gray-900"
                            onClick={() => void loadTransfer(transferId)}
                            aria-label="Učitaj prenosnicu"
                          >
                            <FileText size={14} />
                            Prenosnica
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {savedLine?.generatedTransfer && transferRecord ? (
                      <div className="mt-2 hidden lg:block">
                        <TransferDocumentPanel
                          transfer={transferRecord}
                          onSigned={() => void onLineSaved()}
                          allowSign
                          inventoryMode
                          inventorySessionStatus={session.status}
                          linePendingApplied={lineApplied}
                        />
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 min-w-[160px]">
                    <input
                      value={draft.note}
                      disabled={!canEditThisRow || isReadOnly}
                      onChange={(event) => handleDraftChange(item.id, { note: event.target.value })}
                      placeholder="Napomena"
                      className={inputClass}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {canEditThisRow && !isReadOnly ? (
                      <Button
                        variant="secondary"
                        className="w-full"
                        disabled={savingId === item.id}
                        onClick={() => void handleSaveLine(item)}
                      >
                        <Save size={14} />
                        {savingId === item.id ? '…' : 'Sačuvaj'}
                      </Button>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Nema opreme za prikaz.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {transferSheetEquipmentId && sheetItem ? (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Zatvori prenosnicu"
            onClick={() => setTransferSheetEquipmentId(null)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl shadow-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900">Prenosnica — {sheetItem.inventoryNumber}</h3>
              <button
                type="button"
                onClick={() => setTransferSheetEquipmentId(null)}
                className="p-2 rounded-lg hover:bg-gray-100"
                aria-label="Zatvori"
              >
                <X size={18} />
              </button>
            </div>
            {sheetTransfer ? (
              <TransferDocumentPanel
                transfer={sheetTransfer}
                onSigned={() => void onLineSaved()}
                allowSign
                inventoryMode
                inventorySessionStatus={session.status}
                linePendingApplied={sheetLine?.pendingAction?.status === 'applied'}
              />
            ) : (
              <p className="text-sm text-gray-500">
                {loadingTransferId === sheetTransferId ? 'Učitavam prenosnicu…' : 'Učitavanje…'}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
