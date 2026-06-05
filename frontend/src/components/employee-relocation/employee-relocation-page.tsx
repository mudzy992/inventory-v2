import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, Check, X } from 'lucide-react';
import {
  fetchRelocationWorkPageApi,
  resolveRelocationDestApi,
  resolveRelocationSourceApi,
  type RelocationLine,
} from '../../api/employee-relocation-api';
import { PaginationControls } from '../ui/pagination-controls';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { useRefreshData } from '../../useStore';
import { Button } from '../ui/button';
import { PageHeaderRow } from '../ui/page-header-row';
import { ResponsiveTable } from '../ui/responsive-table';
import {
  InventoryFreezeActionHint,
  useInventoryFreezeActive,
} from '../inventory-count/inventory-freeze-action-hint';

const lineStatusLabel: Record<string, string> = {
  pending_source: 'Čeka izvor',
  pending_dest: 'Čeka cilj',
  accepted: 'Prihvaćeno',
  rejected: 'Odbijeno',
  discharged: 'Razduženo',
};

const RelocationLineRow = ({
  line,
  mode,
  onDone,
  frozen,
  asCard = false,
}: {
  line: RelocationLine;
  mode: 'source' | 'dest';
  onDone: () => void;
  frozen: boolean;
  asCard?: boolean;
}) => {
  const { toastError, toastSuccess } = useToast();
  const [busy, setBusy] = useState(false);
  const employeeName = `${line.case.employee.firstName} ${line.case.employee.lastName}`;

  const runSource = async (action: 'transfer' | 'discharge') => {
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

  const actions = mode === 'source' ? (
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy || frozen} onClick={() => void runSource('transfer')}>
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

  if (asCard) {
    return (
      <div className="p-4 space-y-2">
        <p className="font-mono text-xs text-gray-800">{line.equipment.inventoryNumber}</p>
        <p className="text-sm text-gray-700">{employeeName}</p>
        <p className="text-xs text-gray-500">{lineStatusLabel[line.status] ?? line.status}</p>
        {actions}
      </div>
    );
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2 font-mono text-xs">{line.equipment.inventoryNumber}</td>
      <td className="px-4 py-2">{employeeName}</td>
      <td className="px-4 py-2">{lineStatusLabel[line.status] ?? line.status}</td>
      <td className="px-4 py-2">{actions}</td>
    </tr>
  );
};

export const EmployeeRelocationPage = () => {
  const refresh = useRefreshData();
  const { toastError } = useToast();
  const frozen = useInventoryFreezeActive();
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
                  {sourceLines.map((line) => (
                    <RelocationLineRow
                      key={line.id}
                      line={line}
                      mode="source"
                      frozen={frozen}
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
