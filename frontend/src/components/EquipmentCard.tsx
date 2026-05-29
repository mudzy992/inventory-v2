import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useStore } from '../useStore';
import { getNextDocumentNumber, getCurrentUser, isAdmin, addNotification } from '../store';
import { getOrgUnitPath, getEmployeeFullName, formatDate, getStatusLabel, getStatusColor, getSignerForEmployee } from '../helpers';
import { X, Package, QrCode, History, ArrowRight, Download, Printer, User, Building2, FileText, AlertTriangle, CheckCircle, Warehouse, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { TransferType } from '../types';

interface EquipmentCardProps {
  equipmentId: string;
  onClose: () => void;
  showTransferActions?: boolean;
}

export function EquipmentCard({ equipmentId, onClose, showTransferActions = true }: EquipmentCardProps) {
  const [state, setState] = useStore();
  const [showQR, setShowQR] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferType, setTransferType] = useState<TransferType>('prenos');
  const [toPersonId, setToPersonId] = useState('');
  const [reason, setReason] = useState('');

  const currentUser = getCurrentUser();
  const admin = isAdmin();

  const equipment = state.equipment.find(e => e.id === equipmentId);
  if (!equipment) return null;

  const eq = equipment; // This satisfies TypeScript that eq is defined
  const cat = state.categories.find(c => c.id === eq.categoryId);
  const holder = eq.currentHolderId ? state.employees.find(e => e.id === eq.currentHolderId) : null;
  const holderOrg = holder ? state.orgUnits.find(o => o.id === holder.orgUnitId) : null;
  const transfers = state.transfers.filter(t => t.equipmentId === equipmentId).sort((a, b) => b.date.localeCompare(a.date));

  // Generate QR data - this would be the URL in production
  const qrData = `INVENTAR:${eq.inventoryNumber}|${eq.id}`;

  const canTransfer = admin && eq.status !== 'rashodovano';
  const canAssign = admin && eq.status === 'skladiste';
  const canReturn = admin && eq.status === 'zaduzeno';
  const canDecommission = admin && eq.status !== 'rashodovano';

  function handleDownloadQR() {
    const canvas = document.createElement('canvas');
    const svg = document.querySelector('#equipment-qr-code svg');
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
      ctx.fillText(eq.inventoryNumber, 150, 300);
      ctx.font = '12px Arial';
      ctx.fillText(cat?.name || '', 150, 320);
      ctx.fillText('Skeniraj za detalje', 150, 340);

      const link = document.createElement('a');
      link.download = `QR-${eq.inventoryNumber}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  }

  function handlePrintQR() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR - ${eq.inventoryNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
          .qr-container { display: inline-block; border: 2px solid #333; padding: 20px; border-radius: 12px; }
          .inv-number { font-size: 16px; font-weight: bold; margin-top: 15px; }
          .category { font-size: 12px; color: #666; margin-top: 5px; }
          .instruction { font-size: 10px; color: #999; margin-top: 10px; }
          @media print {
            body { padding: 0; }
            .qr-container { border: 1px solid #000; }
          }
        </style>
      </head>
      <body>
        <div class="qr-container">
          ${document.querySelector('#equipment-qr-code')?.innerHTML || ''}
          <div class="inv-number">${eq.inventoryNumber}</div>
          <div class="category">${cat?.name || ''}</div>
          <div class="instruction">Skeniraj za detalje opreme</div>
        </div>
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  function handleTransfer() {
    if (!currentUser) return;
    
    const employee = state.employees.find(e => e.id === currentUser.employeeId);
    if (!employee) return;

    if ((transferType === 'zaduzenje' || transferType === 'prenos') && !toPersonId) {
      alert('Odaberite osobu na koju prenosite opremu.');
      return;
    }

    // Get signer
    let signerId = '';
    if (transferType === 'zaduzenje' || transferType === 'prenos') {
      const signer = getSignerForEmployee(state, toPersonId);
      signerId = signer?.id || state.employees[0]?.id || '';
    } else if (eq.currentHolderId) {
      const signer = getSignerForEmployee(state, eq.currentHolderId);
      signerId = signer?.id || state.employees[0]?.id || '';
    } else {
      const dirUnit = state.orgUnits.find(o => o.type === 'direkcija');
      signerId = dirUnit?.signerId || state.employees[0]?.id || '';
    }

    const docNumber = getNextDocumentNumber();
    const transfer = {
      id: uuidv4(),
      equipmentId: eq.id,
      type: transferType,
      fromType: (eq.status === 'zaduzeno' ? 'osoba' : 'skladiste') as 'skladiste' | 'osoba',
      fromPersonId: eq.currentHolderId || undefined,
      toType: (transferType === 'razduzenje' ? 'skladiste' : transferType === 'rashodovanje' ? 'rashod' : 'osoba') as 'skladiste' | 'osoba' | 'rashod',
      toPersonId: (transferType === 'zaduzenje' || transferType === 'prenos') ? toPersonId : undefined,
      signerId,
      date: new Date().toISOString().slice(0, 10),
      reason: reason || undefined,
      status: 'raw' as const,
      documentNumber: docNumber,
    };

    let newStatus = eq.status;
    let newHolder = eq.currentHolderId;

    if (transferType === 'zaduzenje' || transferType === 'prenos') {
      newStatus = 'zaduzeno';
      newHolder = toPersonId;
    } else if (transferType === 'razduzenje') {
      newStatus = 'skladiste';
      newHolder = undefined;
    } else if (transferType === 'rashodovanje') {
      newStatus = 'rashodovano';
      newHolder = undefined;
    }

    setState(prev => ({
      ...prev,
      transfers: [...prev.transfers, transfer],
      equipment: prev.equipment.map(e =>
        e.id === eq.id ? { ...e, status: newStatus as typeof e.status, currentHolderId: newHolder } : e
      ),
    }));

    // Notify the recipient
    if (toPersonId) {
      const toUser = state.users.find(u => u.employeeId === toPersonId);
      if (toUser) {
        addNotification(
          toUser.id,
          'equipment_assigned',
          'Nova oprema zadužena',
          `Oprema ${eq.inventoryNumber} (${cat?.name}) je zadužena na vas.`,
          eq.id
        );
      }
    }

    setShowTransferModal(false);
    setToPersonId('');
    setReason('');
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Package size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{eq.inventoryNumber}</h2>
              <p className="text-blue-100 text-sm">{cat?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              eq.status === 'zaduzeno' ? 'bg-green-500 text-white' :
              eq.status === 'skladiste' ? 'bg-blue-400 text-white' :
              'bg-red-500 text-white'
            }`}>
              {getStatusLabel(eq.status)}
            </span>
            <button onClick={onClose} className="text-white/70 hover:text-white p-1">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column - Details */}
            <div className="space-y-5">
              {/* Current Holder */}
              {holder && (
                <div className="bg-green-50 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-green-800 uppercase mb-2 flex items-center gap-1">
                    <User size={12} /> Trenutno zadužen na
                  </h3>
                  <p className="text-green-900 font-medium">{getEmployeeFullName(holder)}</p>
                  <p className="text-green-700 text-sm">{holder.title}</p>
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

              {eq.status === 'rashodovano' && (
                <div className="bg-red-50 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-red-800 uppercase mb-2 flex items-center gap-1">
                    <AlertTriangle size={12} /> Status
                  </h3>
                  <p className="text-red-900 font-medium">Rashodovano</p>
                  {eq.notes && <p className="text-red-700 text-sm mt-1">{eq.notes}</p>}
                </div>
              )}

              {/* Specifications */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Specifikacije</h3>
                <div className="space-y-2">
                  {cat && [...cat.fields, ...cat.optionalFields].map(f => {
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
                    <span className="text-sm text-gray-500">Br. ugovora</span>
                    <span className="text-sm font-medium text-gray-800">{eq.contractNumber || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-500">Datum ulaza</span>
                    <span className="text-sm font-medium text-gray-800">{formatDate(eq.entryDate)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - QR & History */}
            <div className="space-y-5">
              {/* QR Code */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <QrCode size={16} /> QR Kod
                  </h3>
                  <button
                    onClick={() => setShowQR(!showQR)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    {showQR ? 'Sakrij' : 'Prikaži'}
                  </button>
                </div>
                {showQR && (
                  <div className="text-center">
                    <div id="equipment-qr-code" className="inline-block bg-white p-4 rounded-xl shadow-sm">
                      <QRCodeSVG value={qrData} size={180} level="H" />
                    </div>
                    <div className="mt-3 flex justify-center gap-2">
                      <button
                        onClick={handleDownloadQR}
                        className="flex items-center gap-1.5 text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 transition-colors"
                      >
                        <Download size={12} /> Preuzmi
                      </button>
                      <button
                        onClick={handlePrintQR}
                        className="flex items-center gap-1.5 text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        <Printer size={12} /> Štampaj
                      </button>
                    </div>
                  </div>
                )}
                {!showQR && (
                  <p className="text-xs text-gray-400 text-center">Klikni "Prikaži" za QR kod opreme</p>
                )}
              </div>

              {/* Transfer History */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <History size={16} /> Historija kretanja
                </h3>
                {transfers.length > 0 ? (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {transfers.map(t => {
                      const from = t.fromPersonId ? state.employees.find(e => e.id === t.fromPersonId) : null;
                      const to = t.toPersonId ? state.employees.find(e => e.id === t.toPersonId) : null;
                      return (
                        <div key={t.id} className="bg-gray-50 rounded-lg p-3">
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
                        </div>
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

        {/* Actions Footer */}
        {showTransferActions && canTransfer && (
          <div className="border-t border-gray-100 px-6 py-4 bg-gray-50 flex justify-between items-center">
            <div className="text-xs text-gray-400">
              <FileText size={12} className="inline mr-1" />
              {transfers.length} prenosnica
            </div>
            <div className="flex gap-2">
              {canAssign && (
                <button
                  onClick={() => { setTransferType('zaduzenje'); setShowTransferModal(true); }}
                  className="flex items-center gap-1.5 text-sm bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                  <User size={14} /> Zaduži
                </button>
              )}
              {canReturn && (
                <>
                  <button
                    onClick={() => { setTransferType('prenos'); setShowTransferModal(true); }}
                    className="flex items-center gap-1.5 text-sm bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    <ArrowRight size={14} /> Prenesi
                  </button>
                  <button
                    onClick={() => { setTransferType('razduzenje'); setShowTransferModal(true); }}
                    className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Warehouse size={14} /> Razduži
                  </button>
                </>
              )}
              {canDecommission && (
                <button
                  onClick={() => { setTransferType('rashodovanje'); setShowTransferModal(true); }}
                  className="flex items-center gap-1.5 text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                >
                  <Trash2 size={14} /> Rashod
                </button>
              )}
            </div>
          </div>
        )}

        {/* Transfer Modal */}
        {showTransferModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={() => setShowTransferModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4">
                {transferType === 'zaduzenje' && '📦 Zaduženje opreme'}
                {transferType === 'prenos' && '🔄 Prenos opreme'}
                {transferType === 'razduzenje' && '🏪 Razduženje opreme'}
                {transferType === 'rashodovanje' && '🗑️ Rashodovanje opreme'}
              </h3>

              <div className="space-y-4">
                {(transferType === 'zaduzenje' || transferType === 'prenos') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Zadužiti na osobu *</label>
                    <select
                      value={toPersonId}
                      onChange={e => setToPersonId(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">— Odaberi osobu —</option>
                      {state.employees
                        .filter(e => e.id !== eq.currentHolderId)
                        .map(emp => (
                          <option key={emp.id} value={emp.id}>
                            {getEmployeeFullName(emp)} — {emp.title}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {(transferType === 'razduzenje' || transferType === 'rashodovanje') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Razlog</label>
                    <textarea
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      rows={3}
                      placeholder={transferType === 'rashodovanje' ? 'Razlog rashodovanja...' : 'Razlog razduženja...'}
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Odustani
                </button>
                <button
                  onClick={handleTransfer}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <CheckCircle size={14} className="inline mr-1" />
                  Potvrdi
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
