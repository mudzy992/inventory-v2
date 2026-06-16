import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore, useRefreshData } from '../../useStore';
import { signTransferApi, uploadTransferDocumentApi, fetchTransferApi } from '../../api/data-api';
import { fetchTransfersPageApi } from '../../api/transfers-api';
import {
  getTransferEquipmentLabel,
  getTransferFromPersonName,
  getTransferSignerName,
  getTransferToPersonName,
} from '../../helpers/transfer-display.util';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { getEmployeeFullName, getStatusLabel, formatDate, getOrgUnitPath, getStatusColor } from '../../helpers';
import { usePublicSettings } from '../../contexts/public-settings-context';
import { useAdminSettings } from '../../contexts/admin-settings-context';
import { canSignTransfer } from '../../helpers/guards';
import { refreshAfterMutation } from '../../helpers/run-mutation-with-refresh.util';
import {
  buildCompanyHeaderHtml,
  companyHeaderFromSettings,
} from '../../helpers/company-header.util';
import { Search, Filter, FileText, Printer, Upload, CheckCircle, Eye } from 'lucide-react';
import { TransferDocumentPanel } from '../TransferDocumentPanel';
import { PaginationControls } from '../ui/pagination-controls';
import { ModalRoot } from '../ui/modal-root';
import type { TransferRecord } from '../../types';

export const TransferDocumentsTab = () => {
  const [state] = useStore();
  const refresh = useRefreshData();
  const { toastError } = useToast();
  const { settings } = usePublicSettings();
  const { getBoolean: getAdminBoolean } = useAdminSettings();
  const companyHeader = companyHeaderFromSettings(settings);
  const [filterStatus, setFilterStatus] = useState('');
  const [viewDoc, setViewDoc] = useState<string | null>(null);
  const [viewTransfer, setViewTransfer] = useState<TransferRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const fetchPage = useCallback(
    (params: Parameters<typeof fetchTransfersPageApi>[0]) =>
      fetchTransfersPageApi({
        ...params,
        ...(filterStatus ? { status: filterStatus as TransferRecord['status'] } : {}),
      }),
    [filterStatus],
  );

  const list = usePaginatedList<TransferRecord, Record<string, never>>({
    fetchPage,
    initialSortBy: 'date',
    initialSortDir: 'desc',
  });

  const search = list.search;
  const setSearch = list.setSearch;
  const transfers = list.items;

  useEffect(() => {
    if (!viewDoc) {
      setViewTransfer(null);
      return;
    }
    const fromList = transfers.find((row) => row.id === viewDoc);
    if (fromList) {
      setViewTransfer(fromList);
      return;
    }
    void fetchTransferApi(viewDoc)
      .then((row) => setViewTransfer(row as TransferRecord))
      .catch(() => setViewTransfer(null));
  }, [transfers, viewDoc]);

  function handleSignDoc(transferId: string) {
    setUploadingId(transferId);
    fileInputRef.current?.click();
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!uploadingId || !file) return;
    try {
      await uploadTransferDocumentApi(uploadingId, file);
      await signTransferApi(uploadingId, {});
      await refreshAfterMutation([refresh, list.refresh]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška pri uploadu';
      toastError(message);
    } finally {
      setUploadingId(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleMarkSigned = async (transferId: string) => {
    const transfer = transfers.find((row) => row.id === transferId);
    const signGuard = canSignTransfer({
      hasUploadedPdf: Boolean(transfer?.scannedDocUrl),
      requireSignedUpload: getAdminBoolean('transfer.require_signed_pdf_upload', true),
      allowFinalizeWithoutUpload: getAdminBoolean('transfer.allow_finalize_without_upload', false),
    });
    if (!signGuard.allowed) {
      toastError(signGuard.reason ?? 'Finalizacija nije dozvoljena.');
      return;
    }
    try {
      await signTransferApi(transferId, {});
      await refreshAfterMutation([refresh, list.refresh]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška pri potpisivanju';
      toastError(message);
    }
  };

  async function printPrenosnica(transferId: string) {
    const t =
      transfers.find((row) => row.id === transferId) ??
      ((await fetchTransferApi(transferId)) as TransferRecord);
    const cat = t.equipment?.categoryId
      ? state.categories.find((c) => c.id === t.equipment!.categoryId)
      : null;
    const from = t.fromPerson;
    const to = t.toPerson;
    const signer = t.signer;
    const fromOrg = from?.orgUnitId ? getOrgUnitPath(state.orgUnits, from.orgUnitId) : '';
    const toOrg = to?.orgUnitId ? getOrgUnitPath(state.orgUnits, to.orgUnitId) : '';

    const specs = '';

    const html = `
      <!DOCTYPE html>
      <html><head><title>Prenosnica ${t.documentNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; font-size: 13px; color: #333; }
        h1 { text-align: center; font-size: 18px; margin-bottom: 5px; }
        h2 { text-align: center; font-size: 14px; color: #666; margin-bottom: 30px; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 15px; }
        .company { font-size: 16px; font-weight: bold; }
        .doc-info { display: flex; justify-content: space-between; margin-bottom: 20px; }
        .section { margin-bottom: 20px; }
        .section-title { font-weight: bold; font-size: 14px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        .signatures { display: flex; justify-content: space-between; margin-top: 60px; }
        .sig-box { width: 30%; text-align: center; }
        .sig-line { border-top: 1px solid #333; margin-top: 60px; padding-top: 5px; font-size: 12px; }
        .status-badge { background: ${t.status === 'raw' ? '#fef3c7' : '#d1fae5'}; color: ${t.status === 'raw' ? '#92400e' : '#065f46'}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      ${buildCompanyHeaderHtml(companyHeader)}
      <h1>PRENOSNICA</h1>
      <h2>${getStatusLabel(t.type).toUpperCase()} OPREME</h2>
      <div class="doc-info">
        <div><strong>Broj dokumenta:</strong> ${t.documentNumber}</div>
        <div><strong>Datum:</strong> ${formatDate(t.date)}</div>
        <div><strong>Status:</strong> <span class="status-badge">${t.status === 'raw' ? 'RAW - ČEKA POTPIS' : 'POTPISAN'}</span></div>
      </div>

      <div class="section">
        <div class="section-title">Podaci o opremi</div>
        <table>
          <tr><td style="padding:4px 8px;border:1px solid #ccc;font-weight:500;width:40%;">Kategorija</td><td style="padding:4px 8px;border:1px solid #ccc;">${cat?.name || '—'}</td></tr>
          <tr><td style="padding:4px 8px;border:1px solid #ccc;font-weight:500;">Inventurni broj</td><td style="padding:4px 8px;border:1px solid #ccc;">${getTransferEquipmentLabel(t)}</td></tr>
          ${specs}
          <tr><td style="padding:4px 8px;border:1px solid #ccc;font-weight:500;">Broj ugovora</td><td style="padding:4px 8px;border:1px solid #ccc;">—</td></tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">Predao/la</div>
        <table>
          <tr><td style="padding:4px 8px;border:1px solid #ccc;font-weight:500;width:40%;">Izvor</td><td style="padding:4px 8px;border:1px solid #ccc;">${t.fromType === 'skladiste' ? 'SKLADIŠTE' : from ? getEmployeeFullName(from) : '—'}</td></tr>
          ${from ? `<tr><td style="padding:4px 8px;border:1px solid #ccc;font-weight:500;">Pozicija</td><td style="padding:4px 8px;border:1px solid #ccc;">${from.title}</td></tr>
          <tr><td style="padding:4px 8px;border:1px solid #ccc;font-weight:500;">Org. jedinica</td><td style="padding:4px 8px;border:1px solid #ccc;">${fromOrg}</td></tr>` : ''}
        </table>
      </div>

      <div class="section">
        <div class="section-title">Preuzeo/la</div>
        <table>
          <tr><td style="padding:4px 8px;border:1px solid #ccc;font-weight:500;width:40%;">Odredište</td><td style="padding:4px 8px;border:1px solid #ccc;">${t.toType === 'skladiste' ? 'SKLADIŠTE' : t.toType === 'rashod' ? 'RASHOD / OTPIS' : to ? getEmployeeFullName(to) : '—'}</td></tr>
          ${to ? `<tr><td style="padding:4px 8px;border:1px solid #ccc;font-weight:500;">Pozicija</td><td style="padding:4px 8px;border:1px solid #ccc;">${to.title}</td></tr>
          <tr><td style="padding:4px 8px;border:1px solid #ccc;font-weight:500;">Org. jedinica</td><td style="padding:4px 8px;border:1px solid #ccc;">${toOrg}</td></tr>` : ''}
        </table>
      </div>

      ${t.reason ? `<div class="section"><div class="section-title">Razlog</div><p>${t.reason}</p></div>` : ''}
      ${t.notes ? `<div class="section"><div class="section-title">Napomene</div><p>${t.notes}</p></div>` : ''}

      <div class="signatures">
        <div class="sig-box">
          <div class="sig-line">PREDAO/LA<br/>${t.fromType === 'skladiste' ? 'Skladištar' : from ? getEmployeeFullName(from) : '________'}</div>
        </div>
        <div class="sig-box">
          <div class="sig-line">OVLAŠTENA OSOBA<br/>${signer ? getEmployeeFullName(signer) : '________'}<br/><span style="font-size:10px;color:#666;">${signer?.title || ''}</span></div>
        </div>
        <div class="sig-box">
          <div class="sig-line">PREUZEO/LA<br/>${t.toType === 'skladiste' ? 'Skladištar' : t.toType === 'rashod' ? '—' : to ? getEmployeeFullName(to) : '________'}</div>
        </div>
      </div>

      <script>window.onload = function() { window.print(); }</script>
      </body></html>
    `;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Dokumentacija prenosa opreme — RAW i potpisani dokumenti.
      </p>

      <div className="flex flex-wrap gap-2 text-sm mb-4">
        <span className="bg-yellow-50 border border-yellow-200 px-3 py-1.5 rounded-lg text-yellow-700 font-medium">
          RAW na stranici: {transfers.filter((t) => t.status === 'raw').length}
        </span>
        <span className="bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg text-green-700 font-medium">
          Potpisano na stranici: {transfers.filter((t) => t.status === 'potpisan').length}
        </span>
      </div>

      <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Pretraži po broju dokumenta, inv. broju..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
            <option value="">Svi statusi</option>
            <option value="raw">RAW (čeka potpis)</option>
            <option value="potpisan">Potpisan</option>
          </select>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {transfers.map(t => {
          const cat = t.equipment?.categoryId
            ? state.categories.find((c) => c.id === t.equipment!.categoryId)
            : null;
          const fromName = getTransferFromPersonName(t);
          const toName = getTransferToPersonName(t);
          const signerName = getTransferSignerName(t);

          return (
            <div key={t.id} className={`bg-white rounded-xl shadow-sm border ${t.status === 'raw' ? 'border-yellow-200' : 'border-gray-100'} overflow-hidden`}>
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className={t.status === 'raw' ? 'text-yellow-500' : 'text-green-500'} />
                    <span className="font-mono text-sm font-bold text-gray-800">{t.documentNumber}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(t.status)}`}>
                      {t.status === 'raw' ? '⏳ RAW' : '✅ Potpisan'}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-gray-600">
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-16">Tip:</span>
                    <span className="font-medium">{getStatusLabel(t.type)}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-16">Oprema:</span>
                    <span>{getTransferEquipmentLabel(t)} — {cat?.name}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-16">Od:</span>
                    <span>{t.fromType === 'skladiste' ? 'Skladište' : fromName || '—'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-16">Ka:</span>
                    <span>{t.toType === 'skladiste' ? 'Skladište' : t.toType === 'rashod' ? 'RASHOD' : toName || '—'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-16">Potpisnik:</span>
                    <span>{signerName || '—'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-16">Datum:</span>
                    <span>{formatDate(t.date)}</span>
                  </div>
                  {t.reason && (
                    <div className="flex gap-2">
                      <span className="text-gray-400 w-16">Razlog:</span>
                      <span>{t.reason}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                  <button onClick={() => printPrenosnica(t.id)}
                    className="flex items-center gap-1.5 text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors">
                    <Printer size={13} /> Štampaj
                  </button>
                  <button onClick={() => setViewDoc(t.id)}
                    className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
                    <Eye size={13} /> Pregled
                  </button>
                  {t.status === 'raw' && (
                    <>
                      <button onClick={() => handleSignDoc(t.id)}
                        className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors">
                        <Upload size={13} /> Priloži sken
                      </button>
                      <button onClick={() => void handleMarkSigned(t.id)}
                        className="flex items-center gap-1.5 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors">
                        <CheckCircle size={13} /> Potpiši
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {transfers.length === 0 && (
          <div className="col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
            Nema prenosnica
          </div>
        )}
      </div>

      {list.meta ? (
        <PaginationControls
          page={list.page}
          pageSize={list.pageSize}
          total={list.meta.total}
          totalPages={list.meta.totalPages}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
          className="mt-4 rounded-xl border border-gray-100"
        />
      ) : null}

      {/* Preview modal */}
      {viewTransfer && (
        <ModalRoot open onClose={() => setViewDoc(null)} size="xl" panelClassName="bg-white shadow-xl max-w-3xl">
          <div className="bg-white rounded-xl w-full max-h-[90vh] overflow-y-auto">
            {(() => {
              const t = viewTransfer;
              const cat = t.equipment?.categoryId
                ? state.categories.find((c) => c.id === t.equipment!.categoryId)
                : null;
              const fromName = getTransferFromPersonName(t);
              const toName = getTransferToPersonName(t);
              const signerName = getTransferSignerName(t);
              return (
                <div className="p-8">
                  {/* Document Header */}
                  <div className="text-center border-b-2 border-gray-800 pb-4 mb-6">
                    <h2 className="text-lg font-bold text-gray-800">
                      {companyHeader.name?.trim() || 'Preduzeće'}
                    </h2>
                    {(companyHeader.address || companyHeader.city) && (
                      <p className="text-xs text-gray-500">
                        {[companyHeader.address, companyHeader.postalCode, companyHeader.city]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    )}
                  </div>

                  <h1 className="text-xl font-bold text-center text-gray-900 mb-1">PRENOSNICA</h1>
                  <p className="text-center text-sm text-gray-500 mb-6">{getStatusLabel(t.type).toUpperCase()} OPREME</p>

                  <div className="flex justify-between mb-6 text-sm">
                    <div><strong>Broj:</strong> {t.documentNumber}</div>
                    <div><strong>Datum:</strong> {formatDate(t.date)}</div>
                    <div>
                      <strong>Status:</strong>{' '}
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(t.status)}`}>
                        {t.status === 'raw' ? 'RAW - ČEKA POTPIS' : 'POTPISAN'}
                      </span>
                    </div>
                  </div>

                  {/* Equipment info */}
                  <div className="mb-6">
                    <h3 className="font-semibold text-sm text-gray-700 mb-2 border-b border-gray-200 pb-1">Podaci o opremi</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-gray-50 p-2 rounded"><span className="text-gray-500">Kategorija:</span> <span className="font-medium">{cat?.name}</span></div>
                      <div className="bg-gray-50 p-2 rounded"><span className="text-gray-500">Inv. broj:</span> <span className="font-medium font-mono">{getTransferEquipmentLabel(t)}</span></div>
                      <div className="bg-gray-50 p-2 rounded"><span className="text-gray-500">Ugovor:</span> <span className="font-medium">—</span></div>
                    </div>
                  </div>

                  {/* From */}
                  <div className="mb-4">
                    <h3 className="font-semibold text-sm text-gray-700 mb-2 border-b border-gray-200 pb-1">Predao/la</h3>
                    <div className="text-sm">
                      {t.fromType === 'skladiste' ? (
                        <p className="text-blue-600 font-medium">SKLADIŠTE</p>
                      ) : fromName ? (
                        <p className="font-medium">{fromName}</p>
                      ) : <p>—</p>}
                    </div>
                  </div>

                  {/* To */}
                  <div className="mb-4">
                    <h3 className="font-semibold text-sm text-gray-700 mb-2 border-b border-gray-200 pb-1">Preuzeo/la</h3>
                    <div className="text-sm">
                      {t.toType === 'skladiste' ? (
                        <p className="text-blue-600 font-medium">SKLADIŠTE</p>
                      ) : t.toType === 'rashod' ? (
                        <p className="text-red-600 font-medium">RASHOD / OTPIS</p>
                      ) : toName ? (
                        <p className="font-medium">{toName}</p>
                      ) : <p>—</p>}
                    </div>
                  </div>

                  {t.reason && (
                    <div className="mb-4">
                      <h3 className="font-semibold text-sm text-gray-700 mb-1">Razlog</h3>
                      <p className="text-sm text-gray-600 bg-yellow-50 p-2 rounded">{t.reason}</p>
                    </div>
                  )}

                  {/* Signatures area */}
                  <div className="mt-12 grid grid-cols-3 gap-8">
                    <div className="text-center">
                      <div className="border-t border-gray-400 pt-2 mt-16">
                        <p className="text-xs text-gray-500">PREDAO/LA</p>
                        <p className="text-sm font-medium">
                          {t.fromType === 'skladiste' ? 'Skladištar' : fromName || '________'}
                        </p>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="border-t border-gray-400 pt-2 mt-16">
                        <p className="text-xs text-gray-500">OVLAŠTENA OSOBA</p>
                        <p className="text-sm font-medium">{signerName || '________'}</p>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="border-t border-gray-400 pt-2 mt-16">
                        <p className="text-xs text-gray-500">PREUZEO/LA</p>
                        <p className="text-sm font-medium">
                          {t.toType === 'skladiste' ? 'Skladištar' : t.toType === 'rashod' ? '—' : toName || '________'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <TransferDocumentPanel
                      transfer={t}
                      allowSign={t.status === 'raw'}
                      onSigned={() => {
                        void refresh();
                        void list.refresh();
                      }}
                    />
                  </div>
                </div>
              );
            })()}
            <div className="p-6 border-t border-gray-100 flex justify-between">
              <button
                onClick={() => printPrenosnica(viewTransfer.id)}
                className="flex items-center gap-2 text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200"
              >
                <Printer size={16} /> Štampaj
              </button>
              <button onClick={() => setViewDoc(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-300 hover:bg-gray-50">Zatvori</button>
            </div>
          </div>
        </ModalRoot>
      )}
    </div>
  );
};
