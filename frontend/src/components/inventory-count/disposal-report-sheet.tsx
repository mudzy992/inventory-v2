import { Printer, X } from 'lucide-react';
import type { DisposalReportDto } from '../../api/inventory-api';
import { formatDate } from '../../helpers';
import { Button } from '../ui/button';

interface DisposalReportSheetProps {
  report: DisposalReportDto;
  onClose: () => void;
}

const statusLabel: Record<string, string> = {
  pending: 'Na čekanju',
  approved: 'Odobreno',
  rejected: 'Odbijeno',
};

const printSection = (title: string, items: DisposalReportDto['items']['pending']) => {
  if (items.length === 0) {
    return '';
  }
  const rows = items
    .map(
      (item) => `
    <tr>
      <td style="padding:6px 8px;border:1px solid #ccc;font-family:monospace;font-size:11px;">${item.inventoryNumber}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px;">${item.categoryName ?? '—'}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px;">${item.warehouseName ?? '—'}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px;">${statusLabel[item.status] ?? item.status}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:11px;">${item.reviewNote ?? item.lineNote ?? '—'}</td>
    </tr>`,
    )
    .join('');
  return `
    <h3 style="margin:16px 0 8px;font-size:14px;">${title}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:6px 8px;border:1px solid #ccc;text-align:left;">Inventarski br.</th>
          <th style="padding:6px 8px;border:1px solid #ccc;text-align:left;">Kategorija</th>
          <th style="padding:6px 8px;border:1px solid #ccc;text-align:left;">Skladište</th>
          <th style="padding:6px 8px;border:1px solid #ccc;text-align:left;">Status</th>
          <th style="padding:6px 8px;border:1px solid #ccc;text-align:left;">Napomena</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
};

export const DisposalReportSheet = ({ report, onClose }: DisposalReportSheetProps) => {
  const closedLabel = report.session.closedAt ? formatDate(report.session.closedAt.slice(0, 10)) : '—';
  const commissionBlock = report.commissions
    .map(
      (commission) => `
      <div style="margin-bottom:12px;padding:8px;border:1px solid #e5e7eb;border-radius:6px;">
        <p style="margin:0;font-weight:600;">${commission.name}${commission.categoryName ? ` (${commission.categoryName})` : ''}</p>
        <p style="margin:4px 0 0;font-size:11px;color:#4b5563;">
          Predsjednik: ${commission.presidentName ?? '—'} · Članovi: ${commission.memberNames.join(', ') || '—'}
        </p>
      </div>`,
    )
    .join('');
  const handlePrint = () => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Zapisnik rashoda</title></head><body style="font-family:system-ui,sans-serif;padding:24px;color:#111;">
      <h1 style="font-size:18px;margin:0 0 4px;">Zapisnik rashodovanja</h1>
      <p style="margin:0 0 16px;font-size:12px;color:#4b5563;">
        ${report.session.orgUnitName ?? ''} · ${report.session.name} · ${report.session.year}
        · Zatvoreno: ${closedLabel}
      </p>
      <p style="font-size:12px;margin:0 0 12px;">
        Ukupno: ${report.summary.total} · Odobreno: ${report.summary.approved} · Odbijeno: ${report.summary.rejected} · Na čekanju: ${report.summary.pending}
      </p>
      ${commissionBlock}
      ${printSection('Odobrene stavke', report.items.approved)}
      ${printSection('Odbijene stavke', report.items.rejected)}
      ${printSection('Stavke na čekanju', report.items.pending)}
    </body></html>`;
    const win = window.open('', '_blank');
    if (!win) {
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/30 p-4 overflow-auto print:hidden">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl mx-auto p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Zapisnik rashodovanja</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {report.session.orgUnitName} · {report.session.name} · {report.session.year}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handlePrint}>
              <Printer size={14} />
              Štampaj
            </Button>
            <Button variant="secondary" onClick={onClose} aria-label="Zatvori">
              <X size={14} />
            </Button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-sm">
          <div className="rounded-lg bg-gray-50 p-2">
            <div className="font-semibold">{report.summary.total}</div>
            <div className="text-[10px] text-gray-500">Ukupno</div>
          </div>
          <div className="rounded-lg bg-green-50 p-2">
            <div className="font-semibold text-green-800">{report.summary.approved}</div>
            <div className="text-[10px] text-green-700">Odobreno</div>
          </div>
          <div className="rounded-lg bg-red-50 p-2">
            <div className="font-semibold text-red-800">{report.summary.rejected}</div>
            <div className="text-[10px] text-red-700">Odbijeno</div>
          </div>
          <div className="rounded-lg bg-amber-50 p-2">
            <div className="font-semibold text-amber-800">{report.summary.pending}</div>
            <div className="text-[10px] text-amber-700">Na čekanju</div>
          </div>
        </div>
        {report.items.approved.length === 0 && report.items.rejected.length === 0 && report.items.pending.length === 0 ? (
          <p className="mt-6 text-sm text-gray-500 text-center">Nema stavki rashoda za ovu sesiju.</p>
        ) : (
          <div className="mt-4 space-y-4 max-h-[50vh] overflow-y-auto">
            {(['approved', 'rejected', 'pending'] as const).map((key) => {
              const rows = report.items[key];
              if (rows.length === 0) {
                return null;
              }
              const title =
                key === 'approved' ? 'Odobreno' : key === 'rejected' ? 'Odbijeno' : 'Na čekanju';
              return (
                <div key={key}>
                  <h3 className="text-sm font-medium text-gray-800 mb-2">{title}</h3>
                  <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                    {rows.map((item) => (
                      <li key={item.id} className="px-3 py-2 text-sm flex justify-between gap-2">
                        <span className="font-mono text-xs">{item.inventoryNumber}</span>
                        <span className="text-xs text-gray-500 truncate">{item.categoryName}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
