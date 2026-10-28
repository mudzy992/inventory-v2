import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useStore, useRefreshData } from '../useStore';
import { getCurrentUser, isAdmin, isEvidenticar } from '../store';
import { createTransferApi } from '../api/data-api';
import { fetchEquipmentApi, reactivateEquipmentApi } from '../api/equipment-api';
import { EmployeeAutocomplete } from './employee-autocomplete';
import { fetchTransfersPageApi } from '../api/transfers-api';
import { ApiError } from '../api/client';
import { useToast } from '../contexts/toast-context';
import { usePublicSettings } from '../contexts/public-settings-context';
import { ManualPreuzeoLabelInput } from './transfers/manual-preuzeo-label-input';
import { getOrgUnitPath, getEmployeeFullName, formatDate, getStatusLabel, getStatusColor, getEquipmentAffiliationLabel } from '../helpers';
import {
  getEquipmentPrimaryLabel,
  getEquipmentQrFilenameLabel,
  getEquipmentTrackingBadge,
  isAccountingTrackedEquipment,
} from '../helpers/equipment-accounting-tracked.util';
import {
  buildEquipmentDisplayName,
  buildEquipmentQrUrl,
  getUniqueFieldsDisplay,
} from '../helpers/equipment-display.util';
import {
  buildTransferCreatePayload,
  canSignDisposalTransfer,
} from '../helpers/create-transfer-payload.util';
import { canRegistrarCreateTransfer } from '../helpers/registrar-scope';
import {
  canPerformEquipmentTransfer,
  canReactivateEquipment,
  shouldShowManualPreuzeoField,
  EQUIPMENT_GUARD_MESSAGES,
  TRANSFER_GUARD_MESSAGES,
} from '../helpers/guards';
import { X, Package, QrCode, History, ArrowRight, Download, Printer, User, Building2, FileText, AlertTriangle, CheckCircle, Warehouse, Trash2 } from 'lucide-react';
import type { Employee, Equipment, TransferRecord, TransferType } from '../types';
import { TransferDocumentDrawer } from './transfers/transfer-document-drawer';
import { AlertBanner } from './ui/alert-banner';
import { ModalRoot } from './ui/modal-root';
import { MODAL_Z } from '../constants/modal-z-index';
import { EquipmentInstalledPartsPanel } from './maintenance-parts/equipment-installed-parts-panel';
import { EquipmentMarkDisposalDialog } from './equipment/equipment-mark-disposal-dialog';

interface EquipmentCardProps {
  equipmentId: string;
  onClose: () => void;
  showTransferActions?: boolean;
}

export function EquipmentCard({ equipmentId, onClose, showTransferActions = true }: EquipmentCardProps) {
  const [state] = useStore();
  const refresh = useRefreshData();
  const { toastError, toastSuccess } = useToast();
  const { getBoolean } = usePublicSettings();
  const disposalPreListEnabled = getBoolean('features.disposal_pre_list', true);
  const transfersEnabled = getBoolean('features.transfers', true);
  const qrContainerRef = useRef<HTMLDivElement>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferType, setTransferType] = useState<TransferType>('prenos');
  const [toPersonId, setToPersonId] = useState('');
  const [selectedToEmployee, setSelectedToEmployee] = useState<Employee | null>(null);
  const [reason, setReason] = useState('');
  const [manualPreuzeoLabel, setManualPreuzeoLabel] = useState('');
  const [selectedHistoryTransferId, setSelectedHistoryTransferId] = useState<string | null>(null);
  const [showMarkDisposal, setShowMarkDisposal] = useState(false);
  const [showReactivate, setShowReactivate] = useState(false);
  const [reactivateReason, setReactivateReason] = useState('');
  const [eq, setEq] = useState<Equipment | null>(null);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const currentUser = getCurrentUser();
  const admin = isAdmin();
  const evidenticar = isEvidenticar();

  const cat = eq ? state.categories.find((c) => c.id === eq.categoryId) : undefined;
  const holder = eq?.currentHolder ?? null;

  const warehousePreview = useMemo(() => {
    if (!eq || transferType !== 'razduzenje') {
      return null;
    }
    const result = buildTransferCreatePayload({
      state,
      user: currentUser,
      equipment: eq,
      type: 'razduzenje',
      admin,
      evidenticar,
    });
    if (!result.targetWarehouseId) {
      return null;
    }
    return state.warehouses.find((row) => row.id === result.targetWarehouseId);
  }, [admin, currentUser, eq, evidenticar, state, transferType]);

  const loadEquipment = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const [equipment, transferPage] = await Promise.all([
        fetchEquipmentApi(equipmentId),
        fetchTransfersPageApi({
          equipmentId,
          page: 1,
          pageSize: 100,
          sortBy: 'date',
          sortDir: 'desc',
        }),
      ]);
      setEq(equipment);
      setTransfers(transferPage.items);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška pri učitavanju opreme';
      setLoadError(message);
      setEq(null);
      setTransfers([]);
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [equipmentId]);

  const excludeHolderIds = useMemo(() => {
    const holderId = eq?.currentHolderId;
    return holderId ? new Set([holderId]) : undefined;
  }, [eq?.currentHolderId]);

  useEffect(() => {
    void loadEquipment();
  }, [loadEquipment]);

  const holderOrg = holder?.orgUnitId
    ? state.orgUnits.find((o) => o.id === holder.orgUnitId)
    : null;

  if (loading) {
    return (
      <ModalRoot open onClose={onClose} zIndex={MODAL_Z.base} size="xl" panelClassName="max-w-3xl">
        <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl w-full p-8 text-center text-gray-500">
          Učitavam opremu…
        </div>
      </ModalRoot>
    );
  }

  if (loadError || !eq) {
    return (
      <ModalRoot open onClose={onClose} zIndex={MODAL_Z.base} size="md">
        <div className="bg-white rounded-xl shadow-2xl w-full p-6">
          <AlertBanner tone="danger">{loadError ?? 'Oprema nije pronađena.'}</AlertBanner>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Zatvori
            </button>
          </div>
        </div>
      </ModalRoot>
    );
  }

  const qrData = buildEquipmentQrUrl(eq);
  const equipmentLabel = getEquipmentPrimaryLabel(eq);
  const qrFilenameLabel = getEquipmentQrFilenameLabel(eq);
  const trackingBadge = getEquipmentTrackingBadge(eq);
  const displayName = buildEquipmentDisplayName(cat, eq.specifications);
  const uniqueFields = getUniqueFieldsDisplay(cat, eq.specifications);
  const uniqueFieldsSummary = uniqueFields.map((row) => `${row.label}: ${row.value}`).join(' · ');

  const canManage = admin || evidenticar;
  const canRegistrarAct = (type: TransferType): boolean =>
    admin || (evidenticar && currentUser ? canRegistrarCreateTransfer(eq, currentUser, state, type) : false);
  const canTransfer = canManage && transfersEnabled && eq.status !== 'rashodovano' && eq.status !== 'za_rashod';
  const canAssign = canManage && eq.status === 'skladiste' && canRegistrarAct('zaduzenje');
  const canPrenos = canManage && eq.status === 'zaduzeno' && canRegistrarAct('prenos');
  const canRazduzenje = canManage && eq.status === 'zaduzeno' && canRegistrarAct('razduzenje');
  const canMarkForDisposal =
    canManage &&
    disposalPreListEnabled &&
    isAccountingTrackedEquipment(eq) &&
    eq.status === 'skladiste' &&
    !!eq.warehouseId;
  const reactivateGuard = canReactivateEquipment({
    isAdmin: admin,
    status: eq.status,
    warehouseCondition: eq.warehouseCondition,
  });
  const canReactivate = reactivateGuard.allowed;
  const showManualPreuzeoField = shouldShowManualPreuzeoField(transferType, eq);
  const selectedHistoryTransfer =
    transfers.find((row) => row.id === selectedHistoryTransferId) ?? null;

  const openTransferModal = (type: TransferType) => {
    setTransferType(type);
    setManualPreuzeoLabel('');
    setShowTransferModal(true);
  };

  const handleDownloadQR = () => {
    const canvas = document.createElement('canvas');
    const svg = qrContainerRef.current?.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      canvas.width = 300;
      canvas.height = 350;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 25, 25, 250, 250);
      ctx.fillStyle = 'black';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(displayName.slice(0, 40), 150, 290);
      ctx.font = '12px Arial';
      ctx.fillText(qrFilenameLabel, 150, 310);
      if (uniqueFieldsSummary) {
        ctx.fillText(uniqueFieldsSummary.slice(0, 42), 150, 328);
      }
      ctx.fillText('Skeniraj za detalje', 150, 346);
      const link = document.createElement('a');
      link.download = `QR-${qrFilenameLabel}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handlePrintQR = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const qrHtml = qrContainerRef.current?.innerHTML ?? '';
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR - ${qrFilenameLabel}</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
          .qr-container { display: inline-block; border: 2px solid #333; padding: 20px; border-radius: 12px; }
          .inv-number { font-size: 16px; font-weight: bold; margin-top: 15px; }
          .category { font-size: 12px; color: #666; margin-top: 5px; }
          .instruction { font-size: 10px; color: #999; margin-top: 10px; }
        </style>
      </head>
      <body>
        <div class="qr-container">
          ${qrHtml}
          <div style="font-size:13px;font-weight:bold;margin-top:12px;">${displayName}</div>
          ${uniqueFieldsSummary ? `<div style="font-size:11px;margin-top:4px;">${uniqueFieldsSummary}</div>` : ''}
          <div class="inv-number">${equipmentLabel}</div>
          <div class="category">${cat?.name || ''}</div>
          <div class="instruction">Skeniraj za detalje opreme</div>
        </div>
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleCloseTransferModal = () => {
    setShowTransferModal(false);
    setToPersonId('');
    setSelectedToEmployee(null);
    setReason('');
    setManualPreuzeoLabel('');
  };

  const handleTransfer = async () => {
    if (!currentUser || !eq) return;
    const transferGuard = canPerformEquipmentTransfer(transferType, {
      'features.transfers': transfersEnabled,
    });
    if (!transferGuard.allowed) {
      toastError(transferGuard.reason ?? TRANSFER_GUARD_MESSAGES.transfersDisabled);
      return;
    }
    const toEmployee = selectedToEmployee;
    const result = buildTransferCreatePayload({
      state,
      user: currentUser,
      equipment: eq,
      type: transferType,
      toPersonId,
      toPersonOrgUnitId: toEmployee?.orgUnitId,
      reason,
      manualPreuzeoLabel,
      admin,
      evidenticar,
    });
    if (result.error) {
      toastError(result.error);
      return;
    }
    try {
      await createTransferApi(result.payload!);
      await refresh();
      await loadEquipment();
      handleCloseTransferModal();
      toastSuccess('Prenos opreme je izvršen.');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška pri transferu';
      toastError(message);
    }
  };

  const handleReactivate = async () => {
    if (!eq) {
      return;
    }
    const guard = canReactivateEquipment({
      isAdmin: admin,
      status: eq.status,
      warehouseCondition: eq.warehouseCondition,
    });
    if (!guard.allowed) {
      toastError(guard.reason ?? 'Reaktivacija nije dozvoljena.');
      return;
    }
    if (!reactivateReason.trim()) {
      toastError(EQUIPMENT_GUARD_MESSAGES.reactivateReasonRequired);
      return;
    }
    try {
      await reactivateEquipmentApi(eq.id, reactivateReason.trim());
      await loadEquipment();
      setShowReactivate(false);
      setReactivateReason('');
      toastSuccess('Oprema je reaktivirana na skladištu.');
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri reaktivaciji');
    }
  };

  return (
    <>
      <ModalRoot
        open
        onClose={onClose}
        zIndex={MODAL_Z.base}
        size="xl"
        panelClassName="max-w-3xl"
      >
        <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl w-full max-h-[90dvh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Package size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{equipmentLabel}</h2>
              {trackingBadge ? (
                <span className="inline-flex mt-1 text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white">
                  {trackingBadge}
                </span>
              ) : null}
              <p className="text-blue-100 text-sm">
                {cat?.name}
                {eq.stockLot?.productName ? (
                  <span className="ml-1 opacity-80">· {eq.stockLot.productName}</span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              eq.status === 'zaduzeno' ? 'bg-green-500 text-white' :
              eq.status === 'skladiste' ? 'bg-blue-400 text-white' :
              eq.status === 'za_rashod' ? 'bg-orange-500 text-white' :
              'bg-red-500 text-white'
            }`}>
              {getStatusLabel(eq.status)}
            </span>
            <button type="button" onClick={onClose} className="text-white/70 hover:text-white p-1" aria-label="Zatvori">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-5">
              {holder && (
                <div className="bg-green-50 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-green-800 uppercase mb-2 flex items-center gap-1">
                    <User size={12} /> Trenutno zadužen na
                  </h3>
                  <p className="text-green-900 font-medium">{getEmployeeFullName(holder)}</p>
                  {holder.title ? (
                    <p className="text-green-700 text-sm">{holder.title}</p>
                  ) : null}
                  {holderOrg && (
                    <p className="text-green-600 text-xs mt-1 flex items-center gap-1">
                      <Building2 size={10} /> {getOrgUnitPath(state.orgUnits, holderOrg.id)}
                    </p>
                  )}
                </div>
              )}

              {eq.status === 'skladiste' && (
                <div className="bg-blue-50 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-blue-800 uppercase mb-2 flex items-center gap-1">
                    <Warehouse size={12} /> Status
                  </h3>
                  <p className="text-blue-900 font-medium">Na skladištu</p>
                  <p className="text-blue-700 text-sm">Oprema je dostupna za zaduženje</p>
                </div>
              )}

              {eq.status === 'za_rashod' && (
                <div className="bg-orange-50 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-orange-800 uppercase mb-2 flex items-center gap-1">
                    <AlertTriangle size={12} /> Status
                  </h3>
                  <p className="text-orange-900 font-medium">Na listi za rashod</p>
                  {eq.disposalReason && (
                    <p className="text-orange-700 text-sm mt-1">{eq.disposalReason}</p>
                  )}
                </div>
              )}

              {eq.status === 'rashodovano' && (
                <div className="bg-red-50 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-red-800 uppercase mb-2 flex items-center gap-1">
                    <AlertTriangle size={12} /> Status
                  </h3>
                  <p className="text-red-900 font-medium">Rashodovano</p>
                  {eq.disposalReason && (
                    <p className="text-red-700 text-sm mt-1">{eq.disposalReason}</p>
                  )}
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Specifikacije</h3>
                <div className="space-y-2">
                  {cat && [...cat.fields, ...cat.optionalFields].map((f) => {
                    const val = eq.specifications[f.id];
                    if (!val && !f.required) return null;
                    return (
                      <div key={f.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <span className="text-sm text-gray-500">{f.name}</span>
                        <span className="text-sm font-medium text-gray-800">{val || '—'}</span>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-500">Pripadnost</span>
                    <span className="text-sm font-medium text-gray-800">{getEquipmentAffiliationLabel(eq.affiliation)}</span>
                  </div>
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-500">Br. ugovora</span>
                    <span className="text-sm font-medium text-gray-800">{eq.contractNumber || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-500">Datum ulaza</span>
                    <span className="text-sm font-medium text-gray-800">{formatDate(eq.entryDate)}</span>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-500 block mb-1">Napomena</span>
                    {eq.notes ? (
                      <p className="text-sm font-medium text-gray-800 whitespace-pre-wrap break-words">{eq.notes}</p>
                    ) : (
                      <span className="text-sm font-medium text-gray-800">—</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
                  <QrCode size={16} /> QR Kod
                </h3>
                <div className="text-center">
                  <div ref={qrContainerRef} className="inline-block bg-white p-4 rounded-xl shadow-sm">
                    <QRCodeSVG value={qrData} size={180} level="H" />
                  </div>
                  <div className="mt-3 flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadQR}
                      className="flex items-center gap-1.5 text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 transition-colors"
                    >
                      <Download size={12} /> Preuzmi
                    </button>
                    <button
                      type="button"
                      onClick={handlePrintQR}
                      className="flex items-center gap-1.5 text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      <Printer size={12} /> Štampaj
                    </button>
                  </div>
                </div>
              </div>

              {eq.status !== 'rashodovano' && cat ? (
                <EquipmentInstalledPartsPanel
                  equipmentId={equipmentId}
                  equipmentCategoryId={eq.categoryId}
                  equipmentStatus={eq.status}
                  categories={state.categories}
                />
              ) : null}

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <History size={16} /> Historija kretanja
                </h3>
                {transfers.length > 0 ? (
                  <div className="space-y-2 max-h-[280px] overflow-y-auto">
                    {transfers.map((t) => {
                      const from = t.fromPerson;
                      const to = t.toPerson;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className="w-full text-left bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors"
                          onClick={() => setSelectedHistoryTransferId(t.id)}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-gray-700">{getStatusLabel(t.type)}</span>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${getStatusColor(t.status)}`}>
                                {t.status === 'raw' ? 'RAW' : '✓'}
                              </span>
                              <span className="text-xs text-gray-400">{formatDate(t.date)}</span>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500">
                            {t.fromType === 'skladiste' ? 'Skladište' : from ? getEmployeeFullName(from) : '—'}
                            {' → '}
                            {t.toType === 'skladiste' ? 'Skladište' : t.toType === 'rashod' ? 'RASHOD' : to ? getEmployeeFullName(to) : '—'}
                          </p>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">{t.documentNumber}</p>
                          <p className="text-[10px] text-blue-600 mt-1.5">Otvori prenosnicu</p>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-4">Nema historije</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {showTransferActions && canTransfer && (
          <div className="border-t border-gray-100 px-6 py-4 bg-gray-50 flex justify-between items-center">
            <div className="text-xs text-gray-400">
              <FileText size={12} className="inline mr-1" />
              {transfers.length} prenosnica
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              {canAssign && (
                <button
                  type="button"
                  onClick={() => openTransferModal('zaduzenje')}
                  className="flex items-center gap-1.5 text-sm bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                  <User size={14} /> Zaduži
                </button>
              )}
              {(canPrenos || canRazduzenje) && (
                <>
                  {canPrenos && (
                    <button
                      type="button"
                      onClick={() => openTransferModal('prenos')}
                      className="flex items-center gap-1.5 text-sm bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors"
                    >
                      <ArrowRight size={14} /> Prenesi
                    </button>
                  )}
                  {canRazduzenje && (
                    <button
                      type="button"
                      onClick={() => openTransferModal('razduzenje')}
                      className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Warehouse size={14} /> Razduži
                    </button>
                  )}
                </>
              )}
              {canMarkForDisposal && (
                <button
                  type="button"
                  onClick={() => setShowMarkDisposal(true)}
                  className="flex items-center gap-1.5 text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                >
                  <Trash2 size={14} /> Za rashod
                </button>
              )}
              {canReactivate ? (
                <button
                  type="button"
                  onClick={() => setShowReactivate(true)}
                  className="flex items-center gap-1.5 text-sm bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Reaktiviraj
                </button>
              ) : reactivateGuard.reason && eq.status === 'rashodovano' && admin ? (
                <span className="text-xs text-gray-500 self-center" title={reactivateGuard.reason}>
                  Reaktivacija nije dostupna
                </span>
              ) : null}
            </div>
          </div>
        )}

        </div>
      </ModalRoot>

      <ModalRoot open={showTransferModal} onClose={handleCloseTransferModal} zIndex={MODAL_Z.nested} size="md" enableEscape closeOnBackdrop>
        <div className="bg-white rounded-xl shadow-2xl w-full p-6">
          <h3 className="text-lg font-semibold mb-4">
            {transferType === 'zaduzenje' && 'Zaduženje opreme'}
            {transferType === 'prenos' && 'Prenos opreme'}
            {transferType === 'razduzenje' && 'Razduženje opreme'}
          </h3>

          <div className="space-y-4">
            {(transferType === 'zaduzenje' || transferType === 'prenos') && (
              <div>
                <label htmlFor="equipment-transfer-to-person" className="block text-sm font-medium text-gray-700 mb-1">
                  Zadužiti na osobu *
                </label>
                <EmployeeAutocomplete
                  id="equipment-transfer-to-person"
                  orgUnits={state.orgUnits}
                  value={toPersonId}
                  excludeIds={excludeHolderIds}
                  required
                  onChange={(employeeId, employee) => {
                    setToPersonId(employeeId);
                    setSelectedToEmployee(employee);
                  }}
                />
              </div>
            )}

            {transferType === 'razduzenje' && warehousePreview ? (
              <AlertBanner tone="info">
                Ciljno skladište: <strong>{warehousePreview.name}</strong>
              </AlertBanner>
            ) : null}

            {showManualPreuzeoField ? (
              <ManualPreuzeoLabelInput
                value={manualPreuzeoLabel}
                onChange={setManualPreuzeoLabel}
                equipmentId={eq.id}
              />
            ) : null}

            {transferType === 'razduzenje' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Razlog</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={3}
                  placeholder="Razlog razduženja..."
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={handleCloseTransferModal}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Odustani
            </button>
            <button
              type="button"
              onClick={() => void handleTransfer()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <CheckCircle size={14} className="inline mr-1" />
              Potvrdi
            </button>
          </div>
        </div>
      </ModalRoot>

      <EquipmentMarkDisposalDialog
        equipmentId={eq.id}
        inventoryNumber={equipmentLabel}
        equipmentStatus={eq.status}
        warehouseId={eq.warehouseId}
        open={showMarkDisposal}
        onClose={() => setShowMarkDisposal(false)}
        onMarked={() => void loadEquipment({ silent: true })}
      />

      <ModalRoot open={showReactivate} onClose={() => setShowReactivate(false)} zIndex={MODAL_Z.destructive} size="md" enableEscape closeOnBackdrop>
        <div className="bg-white rounded-xl shadow-2xl w-full p-6 space-y-4">
          <h3 className="text-lg font-semibold">Reaktiviraj opremu</h3>
          <p className="text-sm text-gray-600">
            Oprema {equipmentLabel} vraća se na skladište kao aktivna.
          </p>
          <textarea
            value={reactivateReason}
            onChange={(e) => setReactivateReason(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-24"
            placeholder="Obrazloženje reaktivacije *"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowReactivate(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg"
            >
              Odustani
            </button>
            <button
              type="button"
              onClick={() => void handleReactivate()}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg"
            >
              Reaktiviraj
            </button>
          </div>
        </div>
      </ModalRoot>

      {selectedHistoryTransfer ? (
        <TransferDocumentDrawer
          transfer={selectedHistoryTransfer}
          previewMode={selectedHistoryTransfer.status === 'potpisan' ? 'signed' : 'generated'}
          zIndex={MODAL_Z.nested}
          onClose={() => setSelectedHistoryTransferId(null)}
          allowSign={
            canManage &&
            canSignDisposalTransfer(selectedHistoryTransfer) &&
            selectedHistoryTransfer.status !== 'potpisan' &&
            selectedHistoryTransfer.status !== 'cancelled'
          }
          onSigned={() => {
            setSelectedHistoryTransferId(null);
            void refresh().then(() => loadEquipment());
          }}
        />
      ) : null}
    </>
  );
}
