import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import {
  activateInventorySessionApi,
  fetchInventorySessionCloseJobApi,
  closeInventorySessionApi,
  closeInventoryCommitteeApi,
  createInventorySessionApi,
  deleteInventoryCommitteeApi,
  deleteInventorySessionApi,
  fetchInventoryCommitteeReportApi,
  fetchInventoryPrintScopeApi,
  fetchInventorySessionsApi,
  type InventoryCommitteeDto,
  type InventoryPrintScopeDto,
  type InventorySessionDto,
  type InventorySessionCloseJobDto,
} from '../api/inventory-api';
import { ApiError } from '../api/client';
import { resolveRootDistributionOrgUnit } from '../helpers/resolve-root-distribution.util';
import { isAdmin, getCurrentUser } from '../store';
import { useStore } from '../useStore';
import { useToast } from '../contexts/toast-context';
import { useInventorySocketEvents } from '../hooks/use-inventory-socket-events';
import type { Equipment } from '../types';
import { InventoryCommitteeWizard } from './inventory-count/inventory-committee-wizard';
import { InventoryPrintSheet } from './inventory-count/inventory-print-sheet';
import { getCommitteeDisplayLabel } from './inventory-count/inventory-committee-label.util';
import {
  InventoryCommitteeListPanel,
  InventorySessionListPanel,
} from './inventory-count/inventory-committee-list-panel';
import { InventoryCommitteeDetailPanel } from './inventory-count/inventory-committee-detail-panel';
import { InventorySessionEmptyState } from './inventory-count/inventory-session-empty-state';
import { SessionDisposalTab } from './inventory-count/session-disposal-tab';
import { SessionCommandCenter } from './inventory-count/session-command-center';
import { computeInventorySessionStats } from './inventory-count/inventory-session-stats.util';
import { AlertBanner } from './ui/alert-banner';
import { Button } from './ui/button';
import { FormCard } from './ui/form-card';
import { PageHeaderRow } from './ui/page-header-row';

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
  const user = getCurrentUser();
  const userId = user?.id ?? null;
  const { toastError, toastSuccess } = useToast();
  const [sessions, setSessions] = useState<InventorySessionDto[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [committeeId, setCommitteeId] = useState('');
  const [editingCommitteeId, setEditingCommitteeId] = useState<string | null>(null);
  const [printScope, setPrintScope] = useState<InventoryPrintScopeDto | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [sessionTab, setSessionTab] = useState<'committees' | 'disposal'>('committees');
  const [report, setReport] = useState<{
    committee: InventoryCommitteeDto;
    groups: { key: string; label: string; items: any[] }[];
  } | null>(null);
  const [closeJob, setCloseJob] = useState<InventorySessionCloseJobDto | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [sessionName, setSessionName] = useState(`POPIS ${new Date().getFullYear()}`);
  const [loading, setLoading] = useState(false);
  const rootDistribution = useMemo(
    () => resolveRootDistributionOrgUnit(state.orgUnits),
    [state.orgUnits],
  );
  const orgUnitId = rootDistribution?.id ?? '';
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
        const aLabel = getCommitteeDisplayLabel(a.committee);
        const bLabel = getCommitteeDisplayLabel(b.committee);
        return aLabel.localeCompare(bLabel);
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
      setCommitteeId('');
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
  const editingCommittee =
    committees.find((row) => row.id === editingCommitteeId) ??
    (editingCommitteeId && committeeId === editingCommitteeId ? selectedCommittee : null) ??
    null;
  const committeeFromScope = printScope?.committee ?? null;
  const meOnCommittee = useMemo(() => {
    if (!committeeFromScope || !user?.employeeId) {
      return null;
    }
    return committeeFromScope.members.find((m) => m.employeeId === user.employeeId) ?? null;
  }, [committeeFromScope, user?.employeeId]);
  const handleDeleteSession = async (id: string) => {
    if (!confirm('Obrisati sesiju popisa? Ova radnja je nepovratna.')) {
      return;
    }
    try {
      await deleteInventorySessionApi(id);
      if (sessionId === id) {
        setSessionId('');
        setCommitteeId('');
        setEditingCommitteeId(null);
      }
      await loadSessions();
      toastSuccess('Sesija popisa je obrisana.');
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
  };
  const handleDeleteCommittee = async (id: string) => {
    if (!confirm('Obrisati popisnu komisiju? Povezana komisija rashoda će također biti uklonjena.')) {
      return;
    }
    try {
      await deleteInventoryCommitteeApi(id);
      if (committeeId === id) {
        setCommitteeId('');
        setPrintScope(null);
      }
      if (editingCommitteeId === id) {
        setEditingCommitteeId(null);
      }
      await handleSessionRefresh();
      toastSuccess('Popisna komisija je obrisana.');
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
  };
  const canManageDraft = selectedSession?.status === 'draft';
  const canCloseCommittee = Boolean(meOnCommittee?.role === 'predsjednik' && !committeeFromScope?.isClosed);
  const distributionName = rootDistribution?.name;

  return (
    <div className="space-y-6">
      <PageHeaderRow
        title="Godišnji popis"
        description="Sesija popisa po distribuciji; komisije po skladištu i kategoriji; unos samo članovi komisije."
      />
      {!admin ? (
        <>
          {activeCommittees.length === 0 ? (
            <AlertBanner tone="info">
              Niste član niti jedne aktivne komisije popisa. Kad administrator aktivira sesiju, komisija će se pojaviti ovdje.
            </AlertBanner>
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
                                {getCommitteeDisplayLabel(committee)}
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
              {selectedSession && committeeId ? (
                <InventoryCommitteeDetailPanel
                  session={selectedSession}
                committee={selectedCommittee}
                committeeId={committeeId}
                printScope={printScope}
                scopeEquipment={scopeEquipment}
                lines={selectedSession?.committees?.find((row) => row.id === committeeId)?.lines ?? []}
                canCloseCommittee={canCloseCommittee}
                onPrint={() => setShowPrint(true)}
                onReport={async () => {
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
                onCloseCommittee={async () => {
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
                onLineSaved={handleSessionRefresh}
              />
              ) : (
                <FormCard title="Evidencija komisije">
                  <AlertBanner tone="info">Odaberite komisiju sa lijeve strane.</AlertBanner>
                </FormCard>
              )}
            </div>
          )}
        </>
      ) : null}
      {admin ? (
        <>
          {!rootDistribution ? (
            <AlertBanner tone="warning">
              Krovna distribucija nije definisana u organizaciji. U modulu Organizacija dodajte jednu
              distribuciju (direktno pod direkcijom) prije kreiranja sesije popisa.
            </AlertBanner>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Distribucija: <strong>{rootDistribution.name}</strong>
              </p>
              {sessions.length === 0 ? (
                <InventorySessionEmptyState
                  distributionName={distributionName}
                  sessionName={sessionName}
                  year={year}
                  onSessionNameChange={setSessionName}
                  onYearChange={setYear}
                  onCreate={() => void handleCreateSession()}
                />
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => void refreshAll()} disabled={loading}>
                      <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                      Osvježi
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void handleCreateSession()}
                      disabled={!sessionName.trim()}
                    >
                      <Plus size={14} />
                      Nova sesija
                    </Button>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                    <InventorySessionListPanel
                      sessions={sessions}
                      selectedSessionId={sessionId}
                      onSelect={(id) => {
                        setSessionId(id);
                        setCommitteeId('');
                        setEditingCommitteeId(null);
                      }}
                    />
                    {selectedSession ? (
                      <SessionCommandCenter
                        session={selectedSession}
                        stats={sessionStats}
                        scopeTotal={scopeEquipment.length > 0 ? scopeEquipment.length : undefined}
                        closeJob={closeJob}
                        loading={loading}
                        onActivate={(id) => void handleActivate(id)}
                        onClose={(id) => void handleClose(id)}
                        onDelete={(id) => void handleDeleteSession(id)}
                        onRefresh={() => void refreshAll()}
                      />
                    ) : (
                      <FormCard title="Command center">
                        <AlertBanner tone="info">Odaberite sesiju popisa sa lijeve strane.</AlertBanner>
                      </FormCard>
                    )}
                  </div>
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
                          Komisije
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
                        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
                          <div className="space-y-4">
                            {canManageDraft && !editingCommitteeId ? (
                              <InventoryCommitteeWizard
                                sessionId={selectedSession.id}
                                onCreated={async (createdId) => {
                                  await handleSessionRefresh();
                                  setCommitteeId(createdId);
                                }}
                              />
                            ) : null}
                            {canManageDraft && editingCommitteeId && editingCommittee ? (
                              <InventoryCommitteeWizard
                                sessionId={selectedSession.id}
                                editCommittee={editingCommittee}
                                onCreated={() => undefined}
                                onUpdated={async (updatedId) => {
                                  await handleSessionRefresh();
                                  setCommitteeId(updatedId);
                                  setEditingCommitteeId(null);
                                }}
                                onCancelEdit={() => setEditingCommitteeId(null)}
                              />
                            ) : null}
                            <InventoryCommitteeListPanel
                              committees={committees}
                              selectedCommitteeId={committeeId}
                              sessionStatus={selectedSession.status}
                              onSelect={(id) => {
                                setCommitteeId(id);
                                setEditingCommitteeId(null);
                              }}
                              onEdit={(id) => {
                                setCommitteeId(id);
                                setEditingCommitteeId(id);
                              }}
                              onDelete={(id) => void handleDeleteCommittee(id)}
                            />
                          </div>
                          <InventoryCommitteeDetailPanel
                            session={selectedSession}
                            committee={selectedCommittee}
                            committeeId={committeeId}
                            printScope={printScope}
                            scopeEquipment={scopeEquipment}
                            lines={selectedSession.committees?.find((row) => row.id === committeeId)?.lines ?? []}
                            canCloseCommittee={false}
                            canManage={canManageDraft}
                            showAdminLines
                            onPrint={() => setShowPrint(true)}
                            onEdit={
                              canManageDraft && committeeId
                                ? () => setEditingCommitteeId(committeeId)
                                : undefined
                            }
                            onDelete={
                              canManageDraft && committeeId
                                ? () => void handleDeleteCommittee(committeeId)
                                : undefined
                            }
                            onLineSaved={handleSessionRefresh}
                          />
                        </div>
                      )}
                    </>
                  ) : null}
                </>
              )}
            </>
          )}
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
                <h2 className="text-lg font-semibold text-gray-900">
                  Zapisnik — {getCommitteeDisplayLabel(report.committee)}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {report.committee.session?.orgUnit?.name ?? report.committee.session?.orgUnitId ?? ''} ·{' '}
                  {report.committee.session?.name ?? ''} · {report.committee.session?.year ?? ''}
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
