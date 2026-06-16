import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, Check, Link2, X } from 'lucide-react';
import {
  fetchRelocationWorkPageApi,
  mapRelocationLineCatalogApi,
  resolveRelocationDestApi,
  resolveRelocationSourceApi,
  type RelocationLine,
} from '../../api/employee-relocation-api';
import { createCatalogItemApi, type EquipmentCatalogItem } from '../../api/equipment-catalog-api';
import { PaginationControls } from '../ui/pagination-controls';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { useRefreshData } from '../../useStore';
import { isAdmin } from '../../store';
import { Button } from '../ui/button';
import { PageHeaderRow } from '../ui/page-header-row';
import { ResponsiveTable } from '../ui/responsive-table';
import {
  InventoryFreezeActionHint,
  useInventoryFreezeActive,
} from '../inventory-count/inventory-freeze-action-hint';
import { CatalogItemAutocomplete } from '../catalog/catalog-item-autocomplete';
import {
  canMapRelocationCatalog,
  getCatalogDisplayLabel,
  isRelocationLineMissingCatalog,
} from '../../helpers/relocation-catalog.util';
import {
  canResolveRelocationWhileFrozen,
  canTransferRelocationLine,
  EMPLOYEE_RELOCATION_GUARD_MESSAGES,
} from '../../helpers/guards';
import { inputClass } from '../ui/form-styles';
import { ModalRoot } from '../ui/modal-root';

const lineStatusLabel: Record<string, string> = {
  pending_source: 'Čeka izvor',
  pending_dest: 'Čeka cilj',
  accepted: 'Prihvaćeno',
  rejected: 'Odbijeno',
  discharged: 'Razduženo',
};

const CatalogStatusCell = ({ line }: { line: RelocationLine }) => {
  const missing = isRelocationLineMissingCatalog(line);
  const label = getCatalogDisplayLabel(line);
  if (missing) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
        Nema šifrarnika
      </span>
    );
  }
  return <span className="text-xs text-gray-600">{label ?? 'Mapirano'}</span>;
};

const MapCatalogModal = ({
  line,
  open,
  onClose,
  onSaved,
}: {
  line: RelocationLine;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { toastError, toastSuccess } = useToast();
  const [selected, setSelected] = useState<EquipmentCatalogItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (open) {
      setSelected(null);
      setShowCreate(false);
      setNewCode('');
      setNewName('');
    }
  }, [open, line.id]);

  if (!open) {
    return null;
  }

  const handleSubmit = async () => {
    if (!selected) {
      toastError('Odaberite stavku šifrarnika');
      return;
    }
    setBusy(true);
    try {
      await mapRelocationLineCatalogApi(line.id, selected.id);
      toastSuccess('Šifrarnik mapiran');
      onSaved();
      onClose();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri mapiranju');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    if (!newCode.trim() || !newName.trim()) {
      toastError('Unesite šifru i naziv');
      return;
    }
    setBusy(true);
    try {
      const created = await createCatalogItemApi({
        code: newCode.trim(),
        name: newName.trim(),
        categoryId: line.categoryId,
      });
      setSelected(created);
      setShowCreate(false);
      toastSuccess('Stavka šifrarnika kreirana');
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri kreiranju');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalRoot open onClose={onClose} size="md" panelClassName="bg-white shadow-xl max-w-md">
      <div className="bg-white rounded-t-xl sm:rounded-xl w-full max-h-[90dvh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Mapiraj tip u šifrarniku</h3>
          <p className="text-sm text-gray-500 mt-1 font-mono">{line.equipment.inventoryNumber}</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stavka šifrarnika</label>
            <CatalogItemAutocomplete
              categoryId={line.categoryId}
              value={selected}
              onChange={setSelected}
              disabled={busy}
            />
          </div>
          {!showCreate ? (
            <button
              type="button"
              className="text-xs text-blue-600 hover:text-blue-700 underline"
              onClick={() => setShowCreate(true)}
            >
              Kreiraj novu stavku šifrarnika
            </button>
          ) : (
            <div className="rounded-lg border border-gray-200 p-3 space-y-3">
              <p className="text-xs font-medium text-gray-700">Nova stavka</p>
              <input
                type="text"
                className={inputClass}
                placeholder="Šifra"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                disabled={busy}
              />
              <input
                type="text"
                className={inputClass}
                placeholder="Naziv"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={busy}
              />
              <div className="flex gap-2">
                <Button type="button" variant="secondary" disabled={busy} onClick={() => setShowCreate(false)}>
                  Odustani
                </Button>
                <Button type="button" disabled={busy} onClick={() => void handleCreate()}>
                  Kreiraj
                </Button>
              </div>
            </div>
          )}
        </div>
        <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Zatvori
          </Button>
          <Button type="button" disabled={busy || !selected} onClick={() => void handleSubmit()}>
            Mapiraj
          </Button>
        </div>
      </div>
    </ModalRoot>
  );
};

const RelocationLineRow = ({
  line,
  mode,
  onDone,
  frozen,
  admin,
  asCard = false,
}: {
  line: RelocationLine;
  mode: 'source' | 'dest';
  onDone: () => void;
  frozen: boolean;
  admin: boolean;
  asCard?: boolean;
}) => {
  const { toastError, toastSuccess } = useToast();
  const [busy, setBusy] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const employeeName = `${line.case.employee.firstName} ${line.case.employee.lastName}`;
  const missingCatalog = isRelocationLineMissingCatalog(line);
  const transferGuard = canTransferRelocationLine({
    catalogItemId: line.equipment.catalogItemId,
    effectiveCatalogItemId: line.equipment.catalogItem?.id,
  });
  const transferBlocked = mode === 'source' && (missingCatalog || !transferGuard.allowed);
  const transferTitle = missingCatalog
    ? 'Administrator mora mapirati tip u šifrarniku prije transfera.'
    : transferGuard.reason;

  const runSource = async (action: 'transfer' | 'discharge') => {
    const freezeGuard = canResolveRelocationWhileFrozen({ isFrozen: frozen, isAdmin: admin });
    if (!freezeGuard.allowed) {
      toastError(freezeGuard.reason ?? EMPLOYEE_RELOCATION_GUARD_MESSAGES.freezeBlocked);
      return;
    }
    if (action === 'transfer') {
      if (!transferGuard.allowed) {
        toastError(transferGuard.reason ?? EMPLOYEE_RELOCATION_GUARD_MESSAGES.catalogRequiredForTransfer);
        return;
      }
    }
    setBusy(true);
    try {
      await resolveRelocationSourceApi(line.id, action);
      toastSuccess(action === 'transfer' ? 'Transfer poslan na ciljno skladište' : 'Radnik razdužen od opreme');
      onDone();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    } finally {
      setBusy(false);
    }
  };

  const runDest = async (action: 'accept' | 'reject') => {
    const freezeGuard = canResolveRelocationWhileFrozen({ isFrozen: frozen, isAdmin: admin });
    if (!freezeGuard.allowed) {
      toastError(freezeGuard.reason ?? EMPLOYEE_RELOCATION_GUARD_MESSAGES.freezeBlocked);
      return;
    }
    setBusy(true);
    try {
      await resolveRelocationDestApi(line.id, action);
      toastSuccess(action === 'accept' ? 'Oprema prihvaćena' : 'Oprema odbijena');
      onDone();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    } finally {
      setBusy(false);
    }
  };

  const mapAction =
    admin && mode === 'source' && missingCatalog && canMapRelocationCatalog(line) ? (
      <Button variant="secondary" disabled={busy} onClick={() => setMapOpen(true)}>
        <Link2 size={14} />
        Mapiraj tip
      </Button>
    ) : null;

  const actions = mode === 'source' ? (
    <div className="flex flex-wrap gap-2">
      <Button
        disabled={busy || frozen || transferBlocked}
        title={transferTitle}
        onClick={() => void runSource('transfer')}
      >
        <ArrowLeftRight size={14} />
        Prebaci
      </Button>
      <Button
        variant="secondary"
        disabled={busy || frozen}
        onClick={() => void runSource('discharge')}
      >
        Razduži
      </Button>
      {mapAction}
    </div>
  ) : (
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy || frozen} onClick={() => void runDest('accept')}>
        <Check size={14} />
        Prihvati
      </Button>
      <Button
        variant="secondary"
        disabled={busy || frozen}
        onClick={() => void runDest('reject')}
      >
        <X size={14} />
        Odbij
      </Button>
    </div>
  );

  const catalogCell = mode === 'source' ? <CatalogStatusCell line={line} /> : null;

  if (asCard) {
    return (
      <>
        <div className="p-4 space-y-2">
          <p className="font-mono text-xs text-gray-800">{line.equipment.inventoryNumber}</p>
          <p className="text-sm text-gray-700">{employeeName}</p>
          <p className="text-xs text-gray-500">{lineStatusLabel[line.status] ?? line.status}</p>
          {catalogCell}
          {actions}
        </div>
        <MapCatalogModal
          line={line}
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          onSaved={onDone}
        />
      </>
    );
  }

  return (
    <>
      <tr className="border-t">
        <td className="px-4 py-2 font-mono text-xs">{line.equipment.inventoryNumber}</td>
        <td className="px-4 py-2">{employeeName}</td>
        <td className="px-4 py-2">{lineStatusLabel[line.status] ?? line.status}</td>
        {mode === 'source' ? <td className="px-4 py-2">{catalogCell}</td> : null}
        <td className="px-4 py-2">{actions}</td>
      </tr>
      <MapCatalogModal
        line={line}
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        onSaved={onDone}
      />
    </>
  );
};

export const EmployeeRelocationPage = () => {
  const refresh = useRefreshData();
  const { toastError } = useToast();
  const frozen = useInventoryFreezeActive();
  const admin = isAdmin();
  const [sourceLines, setSourceLines] = useState<RelocationLine[]>([]);
  const [destLines, setDestLines] = useState<RelocationLine[]>([]);
  const [sourceMeta, setSourceMeta] = useState<{ page: number; pageSize: number; total: number; totalPages: number } | null>(null);
  const [destMeta, setDestMeta] = useState<{ page: number; pageSize: number; total: number; totalPages: number } | null>(null);
  const [sourcePage, setSourcePage] = useState(1);
  const [destPage, setDestPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRelocationWorkPageApi({ page: sourcePage, pageSize: 25 });
      setSourceLines(data.sourceLines.items ?? []);
      setDestLines(data.destLines.items ?? []);
      setSourceMeta(data.sourceLines.meta);
      setDestMeta(data.destLines.meta);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri učitavanju');
    } finally {
      setLoading(false);
    }
  }, [sourcePage, toastError]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDone = async () => {
    await refresh();
    await load();
  };

  return (
    <div className="space-y-6">
      <PageHeaderRow
        title="Promjena org. jedinice — oprema"
        description="Akcije kada radnik prelazi u org. jedinicu pod drugim skladištem."
      />
      <InventoryFreezeActionHint />

      <section>
        <h2 className="text-sm font-medium text-gray-800 mb-2">Izvorno skladište — potrebna akcija</h2>
        {loading ? (
          <p className="p-6 text-center text-gray-400 text-sm bg-white rounded-xl border border-gray-100">Učitavanje…</p>
        ) : (
          <ResponsiveTable
            isEmpty={sourceLines.length === 0}
            emptyMessage="Nema stavki na izvoru."
            mobile={sourceLines.map((line) => (
              <RelocationLineRow
                key={line.id}
                line={line}
                mode="source"
                frozen={frozen}
                admin={admin}
                asCard
                onDone={() => void handleDone()}
              />
            ))}
            desktop={
              <table className="w-full text-sm">
                <thead className="text-gray-600 bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2">Inventurni broj</th>
                    <th className="text-left px-4 py-2">Radnik</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-left px-4 py-2">Šifrarnik</th>
                    <th className="text-left px-4 py-2">Akcije</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceLines.map((line) => (
                    <RelocationLineRow
                      key={line.id}
                      line={line}
                      mode="source"
                      frozen={frozen}
                      admin={admin}
                      onDone={() => void handleDone()}
                    />
                  ))}
                </tbody>
              </table>
            }
          />
        )}
        {sourceMeta ? (
          <PaginationControls
            page={sourceMeta.page}
            pageSize={sourceMeta.pageSize}
            total={sourceMeta.total}
            totalPages={sourceMeta.totalPages}
            onPageChange={setSourcePage}
          />
        ) : null}
      </section>

      <section>
        <h2 className="text-sm font-medium text-gray-800 mb-2">Ciljno skladište — prihvat opreme</h2>
        {loading ? (
          <p className="p-6 text-center text-gray-400 text-sm bg-white rounded-xl border border-gray-100">Učitavanje…</p>
        ) : (
          <ResponsiveTable
            isEmpty={destLines.length === 0}
            emptyMessage="Nema opreme za prihvat."
            mobile={destLines.map((line) => (
              <RelocationLineRow
                key={line.id}
                line={line}
                mode="dest"
                frozen={frozen}
                admin={admin}
                asCard
                onDone={() => void handleDone()}
              />
            ))}
            desktop={
              <table className="w-full text-sm">
                <thead className="text-gray-600 bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2">Inventurni broj</th>
                    <th className="text-left px-4 py-2">Radnik</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-left px-4 py-2">Akcije</th>
                  </tr>
                </thead>
                <tbody>
                  {destLines.map((line) => (
                    <RelocationLineRow
                      key={line.id}
                      line={line}
                      mode="dest"
                      frozen={frozen}
                      admin={admin}
                      onDone={() => void handleDone()}
                    />
                  ))}
                </tbody>
              </table>
            }
          />
        )}
        {destMeta ? (
          <PaginationControls
            page={destMeta.page}
            pageSize={destMeta.pageSize}
            total={destMeta.total}
            totalPages={destMeta.totalPages}
            onPageChange={setDestPage}
          />
        ) : null}
      </section>
    </div>
  );
};
