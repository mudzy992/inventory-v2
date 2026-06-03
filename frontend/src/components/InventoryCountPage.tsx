import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Printer, RefreshCw, Square } from 'lucide-react';
import {
  activateInventorySessionApi,
  fetchInventorySessionCloseJobApi,
  closeInventorySessionApi,
  closeInventoryCommitteeApi,
  createInventorySessionApi,
  fetchInventoryCommitteeReportApi,
  fetchInventoryPrintScopeApi,
  fetchInventorySessionsApi,
  type InventoryCommitteeDto,
  type InventoryPrintScopeDto,
  type InventorySessionDto,
  type InventorySessionCloseJobDto,
} from '../api/inventory-api';
import { ApiError } from '../api/client';
import { formatDate } from '../helpers';
import { isAdmin, isEvidenticar, getCurrentUser } from '../store';
import { useStore } from '../useStore';
import { useToast } from '../contexts/toast-context';
import { useInventorySocketEvents } from '../hooks/use-inventory-socket-events';
import type { Equipment } from '../types';
import { InventoryCommitteeWizard } from './inventory-count/inventory-committee-wizard';
import { InventoryPrintSheet } from './inventory-count/inventory-print-sheet';
import {
  getInventorySessionStatusLabel,
  getInventorySessionStatusTone,
} from './inventory-count/inventory-labels';
import { SessionDisposalTab } from './inventory-count/session-disposal-tab';
import { SessionLinesPanel } from './inventory-count/session-lines-panel';
import { SessionCommandCenter } from './inventory-count/session-command-center';
import { computeInventorySessionStats } from './inventory-count/inventory-session-stats.util';
import { AlertBanner } from './ui/alert-banner';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { FormCard } from './ui/form-card';
import { PageHeader } from './ui/page-header';
import { DataTable } from './ui/data-table';
import { EmptyState } from './ui/empty-state';
import { inputClass, labelClass, selectClass } from './ui/form-styles';

const mapScopeToEquipment = (scope: InventoryPrintScopeDto): Equipment[] =>
  scope.equipment.map((item) => ({
    id: item.id,
    categoryId: item.categoryId,
    inventoryNumber: item.inventoryNumber,
    specifications: item.specifications ?? {},
    status: item.status as Equipment['status'],
    entryDate: '',
    currentHolderId: item.currentHolder?.id,
    warehouseId: item.warehouse?.id,
  }));

export const InventoryCountPage = () => {
  const [state] = useStore();
  const admin = isAdmin();
  const evidenticar = isEvidenticar();
  const user = getCurrentUser();
  const userId = user?.id ?? null;
  const { toastError, toastSuccess } = useToast();
  const [sessions, setSessions] = useState<InventorySessionDto[]>([]);
  const [orgUnitId, setOrgUnitId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [committeeId, setCommitteeId] = useState('');
  const [printScope, setPrintScope] = useState<InventoryPrintScopeDto | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [sessionTab, setSessionTab] = useState<'committees' | 'disposal'>('committees');
  const [report, setReport] = useState<{ committee: InventoryCommitteeDto; groups: { key: string; label: string; items: any[] }[] } | null>(null);
  const [closeJob, setCloseJob] = useState<InventorySessionCloseJobDto | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [sessionName, setSessionName] = useState(`POPIS ${new Date().getFullYear()}`);
  const [loading, setLoading] = useState(false);
  const distributionOptions = useMemo(
    () => state.orgUnits.filter((ou) => ou.type === 'distribucija'),
    [state.orgUnits],
  );
  const selectedSession = sessions.find((session) => session.id === sessionId) ?? null;
  const committees: InventoryCommitteeDto[] = selectedSession?.committees ?? [];
  const activeCommittees = useMemo(() => {
    if (admin) {
      return [];
    }
    return sessions
      .filter((session) => session.status === 'active')
      .flatMap((session) =>
        (session.committees ?? []).map((committee) => ({
          session,
          committee,
          recordedCount: (committee.lines ?? []).length,
        })),
      )
      .sort((a, b) => {
        const aOrg = a.session.orgUnit?.name ?? '';
        const bOrg = b.session.orgUnit?.name ?? '';
        const orgCmp = aOrg.localeCompare(bOrg);
        if (orgCmp !== 0) {
          return orgCmp;
        }
        const aCat = a.committee.category?.name ?? '';
        const bCat = b.committee.category?.name ?? '';
        return aCat.localeCompare(bCat);
      });
  }, [admin, sessions]);
  const scopeEquipment = useMemo(() => {
    if (!printScope) {
      return [];
    }
    return mapScopeToEquipment(printScope);
  }, [printScope]);
  const loadPrintScope = useCallback(async (id: string) => {
    const scope = await fetchInventoryPrintScopeApi(id);
    setPrintScope(scope);
  }, []);
  const loadSessions = useCallback(async () => {
    const rows = await fetchInventorySessionsApi(orgUnitId || undefined);
    setSessions(rows);
    if (sessionId && !rows.some((row) => row.id === sessionId)) {
      setSessionId('');
    }
  }, [orgUnitId, sessionId]);
  const refreshCloseJob = useCallback(async (id: string) => {
    const latest = await fetchInventorySessionCloseJobApi(id);
    setCloseJob(latest);
    return latest;
  }, []);
  const handleCloseJobSocket = useCallback(
    async (payload: {
      sessionId: string;
      status: string;
      appliedCount: number;
      failedCount: number;
      totalCount: number;
    }) => {
      const latest = await refreshCloseJob(payload.sessionId);
      if (!latest) {
        return;
      }
      if (payload.status === 'done') {
        toastSuccess('Sesija popisa je zatvorena.');
        await loadSessions();
      } else if (payload.status === 'failed') {
        toastError(latest.lastError ?? 'Zatvaranje sesije nije uspjelo.');
        await loadSessions();
      }
    },
    [loadSessions, refreshCloseJob, toastError, toastSuccess],
  );
  useInventorySocketEvents({
    sessionId: sessionId || null,
    onCloseJobUpdated: (payload) => void handleCloseJobSocket(payload),
  });
  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await loadSessions();
      if (committeeId) {
        await loadPrintScope(committeeId);
      }
    } finally {
      setLoading(false);
    }
  }, [committeeId, loadPrintScope, loadSessions]);
  useEffect(() => {
    if (!admin) {
      if (!userId) {
        return;
      }
      void refreshAll();
      return;
    }
    if (!orgUnitId) {
      setSessions([]);
      setPrintScope(null);
      setSessionId('');
      setCommitteeId('');
      return;
    }
    void refreshAll();
  }, [admin, orgUnitId, refreshAll, userId]);
  useEffect(() => {
    if (committeeId) {
      void loadPrintScope(committeeId);
    } else {
      setPrintScope(null);
    }
  }, [committeeId, loadPrintScope]);
  const handleCreateSession = async () => {
    if (!admin || !orgUnitId || !sessionName.trim()) {
      return;
    }
    try {
      const created = await createInventorySessionApi({ name: sessionName.trim(), orgUnitId, year });
      await loadSessions();
      setSessionId(created.id);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
  };
  const handleActivate = async (id: string) => {
    try {
      await activateInventorySessionApi(id);
      await loadSessions();
      toastSuccess('Sesija popisa je aktivirana.');
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
  };
  const handleClose = async (id: string) => {
    if (!confirm('Zatvoriti sesiju popisa? Pokrenuće se obrada pending promjena u pozadini.')) {
      return;
    }
    try {
      const job = await closeInventorySessionApi(id);
      setCloseJob(job);
      const timer = window.setInterval(() => {
        void (async () => {
          try {
            const latest = await fetchInventorySessionCloseJobApi(id);
            if (latest) {
              setCloseJob(latest);
              if (latest.status === 'done' || latest.status === 'failed') {
                window.clearInterval(timer);
                await loadSessions();
              }
            }
          } catch {
            // ignore polling errors
          }
        })();
      }, 2000);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
  };
  const handleSessionRefresh = async () => {
    await loadSessions();
    if (committeeId) {
      await loadPrintScope(committeeId);
    }
  };
  const sessionStats = useMemo(
    () => computeInventorySessionStats(selectedSession),
    [selectedSession],
  );
  const selectedCommittee = committees.find((row) => row.id === committeeId) ?? null;
  const committeeFromScope = printScope?.committee ?? null;
  const meOnCommittee = useMemo(() => {
    if (!committeeFromScope || !user?.employeeId) {
      return null;
    }
    return committeeFromScope.members.find((m) => m.employeeId === user.employeeId) ?? null;
  }, [committeeFromScope, user?.employeeId]);
  const canCloseCommittee = Boolean(meOnCommittee?.role === 'predsjednik' && !committeeFromScope?.isClosed);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Godišnji popis"
        description="Sesija popisa po distribuciji i godini; komisije po kategoriji; unos samo članovi komisije."
      />
      {!admin ? (
        <>
          {activeCommittees.length === 0 ? (
            <EmptyState message="Niste član niti jedne aktivne komisije popisa za tekuću godinu. Kad administrator aktivira sesiju, komisija će se pojaviti ovdje." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
              <FormCard title="Moje komisije">
                <div className="text-xs text-gray-500 mb-3">
                  Aktivne komisije u kojima ste član (klik za evidenciju i štampu).
                </div>
                <div className="rounded-lg border border-gray-100 overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 flex items-center justify-between">
                    <span>Komisija</span>
                    <span>Linije</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {activeCommittees.map(({ session, committee, recordedCount }) => {
                      const me = user?.employeeId
                        ? committee.members.find((m) => m.employeeId === user.employeeId)
                        : undefined;
                      const myRole = me?.role === 'predsjednik' ? 'Predsjednik' : me ? 'Član' : '—';
                      const isSelected = committee.id === committeeId;
                      return (
                        <button
                          key={committee.id}
                          type="button"
                          className={`w-full text-left px-3 py-3 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200 ${
                            isSelected ? 'bg-blue-50/70' : 'bg-white'
                          }`}
                          onClick={() => {
                            setSessionId(session.id);
                            setCommitteeId(committee.id);
                            setPrintScope(null);
                            void loadPrintScope(committee.id);
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">
                                {committee.category?.name ?? committee.categoryId}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5 truncate">
                                {session.orgUnit?.name ?? session.orgUnitId} · {session.name} · {session.year}
                              </div>
                              <div className="text-[11px] text-gray-400 mt-1">{myRole}</div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-xs font-medium text-gray-700">{recordedCount} linija</div>
                              <div className="text-[10px] text-blue-600 mt-0.5">Nastavi unos →</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button variant="secondary" onClick={() => void refreshAll()} disabled={loading}>
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    Osvježi
                  </Button>
                </div>
              </FormCard>
              <div>
                {selectedSession && committeeId ? (
                  <FormCard title="Evidencija komisije">
                    <div className="flex flex-col gap-1">
                      <p className="text-sm text-gray-900 font-medium">
                        {selectedCommittee?.category?.name ?? selectedCommittee?.categoryId ?? '—'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {selectedSession.orgUnit?.name ?? selectedSession.orgUnitId} · {selectedSession.name} ·{' '}
                        {selectedSession.year}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button
                        variant="secondary"
                        onClick={() => setShowPrint(true)}
                        disabled={!committeeId || !printScope}
                      >
                        <Printer size={14} />
                        Štampaj popisnu listu
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          if (!committeeId) {
                            return;
                          }
                          try {
                            const row = await fetchInventoryCommitteeReportApi(committeeId);
                            setReport(row);
                            setShowReport(true);
                          } catch (err) {
                            toastError(err instanceof ApiError ? err.message : 'Greška');
                          }
                        }}
                        disabled={!committeeId}
                      >
                        <Printer size={14} />
                        Zapisnik
                      </Button>
                      {canCloseCommittee ? (
                        <Button
                          variant="danger"
                          onClick={async () => {
                            if (!committeeId) {
                              return;
                            }
                            if (!confirm('Zaključati popisnu listu za ovu komisiju? Nakon zaključavanja unos nije moguć.')) {
                              return;
                            }
                            try {
                              await closeInventoryCommitteeApi(committeeId);
                              await refreshAll();
                            } catch (err) {
                              toastError(err instanceof ApiError ? err.message : 'Greška');
                            }
                          }}
                          disabled={!committeeId || !printScope}
                        >
                          <Square size={14} />
                          Zaključi listu
                        </Button>
                      ) : null}
                    </div>
                    {printScope ? (
                      <>
                        <p className="text-xs text-gray-500 mt-3">
                          Oprema u opsegu: <strong>{scopeEquipment.length}</strong>
                        </p>
                        <SessionLinesPanel
                          key={`${committeeId}-${(selectedSession.committees ?? []).length}`}
                          committeeId={committeeId}
                          isCommitteeClosed={Boolean(committeeFromScope?.isClosed)}
                          session={selectedSession}
                          lines={selectedSession.committees?.find((row) => row.id === committeeId)?.lines ?? []}
                          equipment={scopeEquipment}
                          onLineSaved={handleSessionRefresh}
                        />
                      </>
                    ) : (
                      <AlertBanner tone="info" className="mt-3">
                        Učitavam opseg za štampu/evidenciju…
                      </AlertBanner>
                    )}
                  </FormCard>
                ) : (
                  <FormCard title="Evidencija komisije">
                    <AlertBanner tone="info">Odaberite komisiju sa lijeve strane.</AlertBanner>
                  </FormCard>
                )}
              </div>
            </div>
          )}
        </>
      ) : null}
      {admin ? (
        <FormCard title="Distribucija i sesija" className="max-w-xl">
          <label className={labelClass}>Distribucija</label>
          <select
            value={orgUnitId}
            onChange={(event) => {
              setOrgUnitId(event.target.value);
              setSessionId('');
              setCommitteeId('');
            }}
            className={selectClass}
          >
            <option value="">— Odaberite —</option>
            {distributionOptions.map((ou) => (
              <option key={ou.id} value={ou.id}>
                {ou.name}
              </option>
            ))}
          </select>
          {!orgUnitId ? <AlertBanner>Odaberite distribuciju.</AlertBanner> : null}
        </FormCard>
      ) : null}
      {admin && orgUnitId ? (
        <>
          <div className="grid lg:grid-cols-2 gap-4">
            <FormCard title="Nova sesija">
              {admin ? (
                <>
                  <label className={labelClass}>Naziv</label>
                  <input
                    value={sessionName}
                    onChange={(event) => setSessionName(event.target.value)}
                    className={inputClass}
                    placeholder="POPIS 2026"
                  />
                  <label className={labelClass}>Godina</label>
                  <input
                    type="number"
                    value={year}
                    onChange={(event) => setYear(Number(event.target.value))}
                    className={inputClass}
                    min={2000}
                    max={2100}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void handleCreateSession()}>
                      <Plus size={14} />
                      Kreiraj sesiju
                    </Button>
                    <Button variant="secondary" onClick={() => void refreshAll()} disabled={loading}>
                      <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                      Osvježi
                    </Button>
                  </div>
                </>
              ) : (
                <Button variant="secondary" onClick={() => void refreshAll()} disabled={loading}>
                  <RefreshCw size={14} />
                  Osvježi
                </Button>
              )}
            </FormCard>
            {selectedSession ? (
              <SessionCommandCenter
                session={selectedSession}
                stats={sessionStats}
                scopeTotal={scopeEquipment.length > 0 ? scopeEquipment.length : undefined}
                closeJob={closeJob}
                loading={loading}
                onActivate={(id) => void handleActivate(id)}
                onClose={(id) => void handleClose(id)}
                onRefresh={() => void refreshAll()}
              />
            ) : (
              <FormCard title="Odabrana sesija">
                <AlertBanner tone="info">Odaberite sesiju iz tabele ispod.</AlertBanner>
              </FormCard>
            )}
          </div>
          <DataTable>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Naziv / period</th>
                  <th className="text-left px-4 py-2 font-medium">Godina</th>
                  <th className="text-left px-4 py-2 font-medium">Progres</th>
                  <th className="text-left px-4 py-2 font-medium">Komisije</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((row) => {
                  const isSelected = row.id === sessionId;
                  const period = row.startDate && row.endDate ? `${formatDate(row.startDate)} – ${formatDate(row.endDate)}` : '—';
                  const rowStats = computeInventorySessionStats(row);
                  const rowLines = row.committees?.flatMap((committee) => committee.lines ?? []) ?? [];
                  return (
                    <tr
                      key={row.id}
                      className={`border-t cursor-pointer ${isSelected ? 'bg-blue-50/80' : 'hover:bg-gray-50'}`}
                      onClick={() => {
                        setSessionId(row.id);
                        setCommitteeId('');
                      }}
                    >
                      <td className="px-4 py-3 font-medium">
                        <div className="flex flex-col">
                          <span>{row.name}</span>
                          <span className="text-xs text-gray-400">{period}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{row.year}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {rowLines.length} linija
                        {rowStats.transferPendingCount > 0
                          ? ` · ${rowStats.transferPendingCount} pren.`
                          : ''}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {rowStats.closedCommittees}/{rowStats.totalCommittees}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={getInventorySessionStatusTone(row.status)}>
                          {getInventorySessionStatusLabel(row.status)}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        message={
                          admin
                            ? `Nema sesija popisa za ${distributionOptions.find((ou) => ou.id === orgUnitId)?.name ?? 'odabranu distribuciju'}. Kreirajte novu sesiju iznad.`
                            : 'Nema komisija dodijeljenih vašem korisniku.'
                        }
                      />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </DataTable>
          {selectedSession ? (
            <>
              <div className="flex gap-1 border-b border-gray-200">
                <button
                  type="button"
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    sessionTab === 'committees'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setSessionTab('committees')}
                >
                  Komisije i unos
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    sessionTab === 'disposal'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setSessionTab('disposal')}
                >
                  Rashod
                </button>
              </div>
              {sessionTab === 'disposal' ? (
                <FormCard title="Rashod — sesija popisa">
                  <SessionDisposalTab sessionId={selectedSession.id} sessionStatus={selectedSession.status} />
                </FormCard>
              ) : (
            <FormCard title="Komisije (po kategoriji)">
              {admin && selectedSession.status === 'draft' ? (
                <div className="mb-4">
                  <InventoryCommitteeWizard
                    state={state}
                    sessionId={selectedSession.id}
                    onCreated={async () => {
                      await handleSessionRefresh();
                    }}
                  />
                </div>
              ) : null}
              <label className={labelClass}>Komisija</label>
              <select
                value={committeeId}
                onChange={(event) => setCommitteeId(event.target.value)}
                className={selectClass}
              >
                <option value="">— Odaberite —</option>
                {committees.map((committee) => (
                  <option key={committee.id} value={committee.id}>
                    {committee.category?.name ?? committee.categoryId}
                  </option>
                ))}
              </select>
              {committeeId ? (
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button
                    variant="secondary"
                    onClick={() => setShowPrint(true)}
                    disabled={!printScope}
                  >
                    <Printer size={14} />
                    Štampaj popisnu listu
                  </Button>
                </div>
              ) : null}
              {committeeId && printScope ? (
                <>
                  <p className="text-xs text-gray-500 mt-3">
                    Oprema u opsegu: <strong>{scopeEquipment.length}</strong>
                  </p>
                  <SessionLinesPanel
                    key={`${committeeId}-${(selectedSession.committees ?? []).length}`}
                    committeeId={committeeId}
                    session={selectedSession}
                    lines={selectedSession.committees?.find((row) => row.id === committeeId)?.lines ?? []}
                    equipment={scopeEquipment}
                    onLineSaved={handleSessionRefresh}
                  />
                </>
              ) : (
                <AlertBanner tone="info" className="mt-3">
                  Odaberite komisiju za unos linija.
                </AlertBanner>
              )}
            </FormCard>
              )}
            </>
          ) : null}
        </>
      ) : null}
      {showPrint && printScope ? (
        <InventoryPrintSheet scope={printScope} state={state} onClose={() => setShowPrint(false)} />
      ) : null}
      {showReport && report ? (
        <div className="fixed inset-0 z-50 bg-black/30 p-4 overflow-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl mx-auto p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Zapisnik — {report.committee.category?.name ?? report.committee.categoryId}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {report.committee.session?.orgUnit?.name ?? report.committee.session?.orgUnitId ?? ''} · {report.committee.session?.name ?? ''} · {report.committee.session?.year ?? ''}
                </p>
              </div>
              <Button variant="secondary" onClick={() => setShowReport(false)}>
                Zatvori
              </Button>
            </div>
            <div className="mt-4 space-y-4">
              {report.groups.map((group) => (
                <div key={group.key} className="border border-gray-100 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800">{group.label}</div>
                  <div className="divide-y divide-gray-100">
                    {group.items.map((item) => (
                      <div key={item.equipmentId} className="px-3 py-2 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-mono text-xs text-gray-700">{item.inventoryNumber}</div>
                            <div className="text-xs text-gray-500">{item.categoryName ?? '—'}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-xs font-medium text-gray-800">{item.line?.status ?? 'nije_evidentirano'}</div>
                            {item.line?.generatedTransfer ? (
                              <div className="text-[11px] text-gray-500">{item.line.generatedTransfer.documentNumber}</div>
                            ) : null}
                          </div>
                        </div>
                        {item.line?.note ? <div className="text-xs text-gray-700 mt-1">Napomena: {item.line.note}</div> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
