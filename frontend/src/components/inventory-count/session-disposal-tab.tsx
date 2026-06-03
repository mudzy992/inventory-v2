import { useCallback, useEffect, useState } from 'react';
import { Printer, RefreshCw } from 'lucide-react';
import {
  fetchDisposalReportApi,
  type DisposalReportDto,
  type InventorySessionStatus,
} from '../../api/inventory-api';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { Button } from '../ui/button';
import { AlertBanner } from '../ui/alert-banner';
import { Badge } from '../ui/badge';
import { DisposalInboxPanel } from './disposal-inbox-panel';
import { DisposalReportSheet } from './disposal-report-sheet';

interface SessionDisposalTabProps {
  sessionId: string;
  sessionStatus: InventorySessionStatus;
}

const canShowDisposalWorkflow = (status: InventorySessionStatus): boolean =>
  status === 'closing' || status === 'closed';

export const SessionDisposalTab = ({ sessionId, sessionStatus }: SessionDisposalTabProps) => {
  const { toastError } = useToast();
  const [report, setReport] = useState<DisposalReportDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const row = await fetchDisposalReportApi(sessionId);
      setReport(row);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri učitavanju rashoda');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId, toastError]);
  useEffect(() => {
    if (canShowDisposalWorkflow(sessionStatus)) {
      void loadReport();
    } else {
      setReport(null);
    }
  }, [sessionStatus, loadReport]);
  if (!canShowDisposalWorkflow(sessionStatus)) {
    return (
      <AlertBanner tone="info">
        Tab rashod je dostupan nakon pokretanja zatvaranja sesije (status „zatvaranje” ili „zatvoreno”).
      </AlertBanner>
    );
  }
  return (
    <div className="space-y-4">
      <DisposalInboxPanel sessionId={sessionId} sessionStatus={sessionStatus} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-gray-900">Pregled svih stavki rashoda</h3>
          {report ? (
            <p className="text-xs text-gray-500 mt-0.5">
              {report.summary.approved} odobreno · {report.summary.rejected} odbijeno ·{' '}
              {report.summary.pending} na čekanju
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void loadReport()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Osvježi
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowPrint(true)}
            disabled={!report || report.summary.total === 0}
          >
            <Printer size={14} />
            Zapisnik rashoda
          </Button>
        </div>
      </div>
      {loading && !report ? <p className="text-xs text-gray-500">Učitavanje…</p> : null}
      {report && report.summary.total > 0 ? (
        <div className="rounded-lg border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs">
              <tr>
                <th className="text-left px-3 py-2">Inventarski br.</th>
                <th className="text-left px-3 py-2">Kategorija</th>
                <th className="text-left px-3 py-2">Skladište</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...report.items.pending, ...report.items.approved, ...report.items.rejected].map((item) => (
                <tr key={item.id} className="border-t border-gray-50">
                  <td className="px-3 py-2 font-mono text-xs">{item.inventoryNumber}</td>
                  <td className="px-3 py-2 text-xs">{item.categoryName ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{item.warehouseName ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Badge
                      tone={
                        item.status === 'approved'
                          ? 'success'
                          : item.status === 'rejected'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {item.status === 'approved'
                        ? 'Odobreno'
                        : item.status === 'rejected'
                          ? 'Odbijeno'
                          : 'Na čekanju'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !loading && (
          <p className="text-sm text-gray-500">Nema predloženog rashoda za ovu sesiju.</p>
        )
      )}
      {showPrint && report ? (
        <DisposalReportSheet report={report} onClose={() => setShowPrint(false)} />
      ) : null}
    </div>
  );
};
