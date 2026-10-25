import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../useStore';
import { QrCode, Search, Package, Camera, X } from 'lucide-react';
import { fetchEquipmentApi, fetchEquipmentPageApi } from '../api/equipment-api';
import { ApiError } from '../api/client';
import { EquipmentCard } from './EquipmentCard';
import { isAdmin } from '../store';
import { usePublicSettings } from '../contexts/public-settings-context';
import { EmptyState } from './ui/empty-state';
import type { Equipment } from '../types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function QRScannerPage() {
  const { getBoolean } = usePublicSettings();
  const [state] = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEquipId, setSelectedEquipId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [recentEquipment, setRecentEquipment] = useState<Equipment[]>([]);
  const admin = isAdmin();
  const qrEnabled = getBoolean('features.qr_scanner', true);

  const loadRecent = useCallback(async () => {
    try {
      const response = await fetchEquipmentPageApi({
        status: 'zaduzeno',
        page: 1,
        pageSize: 6,
      });
      setRecentEquipment(response.items);
    } catch {
      setRecentEquipment([]);
    }
  }, []);

  useEffect(() => {
    if (qrEnabled) {
      void loadRecent();
    }
  }, [loadRecent, qrEnabled]);

  if (!qrEnabled) {
    return (
      <div className="p-6">
        <EmptyState message="QR skener modul je isključen u postavkama aplikacije." />
      </div>
    );
  }

  const handleSearch = async () => {
    setError('');
    if (!searchQuery.trim()) {
      return;
    }

    let searchTerm = searchQuery.trim();
    const equipmentPathMatch = /\/equipment\/([0-9a-f-]{36})/i.exec(searchTerm);
    if (equipmentPathMatch) {
      searchTerm = equipmentPathMatch[1];
    } else if (searchTerm.startsWith('INVENTAR:')) {
      const parts = searchTerm.replace('INVENTAR:', '').split('|');
      searchTerm = parts[0] || parts[1] || searchTerm;
    }

    setSearching(true);
    try {
      if (UUID_RE.test(searchTerm)) {
        const found = await fetchEquipmentApi(searchTerm);
        setSelectedEquipId(found.id);
        setSearchQuery('');
        return;
      }

      const response = await fetchEquipmentPageApi({
        search: searchTerm,
        page: 1,
        pageSize: 10,
      });
      const found =
        response.items.find(
          (item) =>
            item.inventoryNumber?.toLowerCase() === searchTerm.toLowerCase() || item.id === searchTerm,
        ) ?? response.items[0];

      if (found) {
        setSelectedEquipId(found.id);
        setSearchQuery('');
      } else {
        setError(`Oprema sa oznakom "${searchTerm}" nije pronađena.`);
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška pri pretrazi';
      setError(message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <QrCode size={28} className="text-blue-500" /> QR Skener
        </h1>
        <p className="text-gray-500 mt-1">Skenirajte ili unesite inventurni broj za pregled opreme</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-6">
        <div className="max-w-md mx-auto">
          <div className="bg-gray-900 rounded-2xl aspect-square flex flex-col items-center justify-center mb-6 relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-48 h-48 border-2 border-white/30 rounded-2xl">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />
              </div>
            </div>
            <Camera size={48} className="text-white/30 mb-4 relative z-10" />
            <p className="text-white/50 text-sm text-center px-4 relative z-10">
              U produkcijskoj verziji ovdje bi bio prikaz kamere za skeniranje QR koda
            </p>
          </div>

          <div className="text-center mb-4">
            <p className="text-sm text-gray-400 mb-2">ili unesite inventurni broj ručno:</p>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <QrCode size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
                placeholder="INV-RS-2024-0001 ili QR kod..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => void handleSearch()}
              disabled={searching}
              className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Search size={18} /> {searching ? '…' : 'Traži'}
            </button>
          </div>

          {error && (
            <div className="mt-4 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <X size={16} /> {error}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Package size={20} className="text-gray-400" /> Brzi pristup opremi
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {recentEquipment.map((eq) => {
            const cat = eq.category ?? state.categories.find((c) => c.id === eq.categoryId);
            const holder = eq.currentHolder;
            return (
              <button
                key={eq.id}
                type="button"
                onClick={() => setSelectedEquipId(eq.id)}
                className="text-left border border-gray-100 rounded-xl p-4 hover:border-blue-200 hover:bg-blue-50 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                    <QrCode size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm font-medium text-gray-800 truncate">{eq.inventoryNumber}</p>
                    <p className="text-xs text-gray-500 truncate">{cat?.name}</p>
                    {holder ? (
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {holder.firstName} {holder.lastName}
                      </p>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {recentEquipment.length === 0 && (
          <p className="text-center text-gray-400 py-8">Nema zadužene opreme</p>
        )}
      </div>

      {selectedEquipId ? (
        <EquipmentCard
          equipmentId={selectedEquipId}
          onClose={() => setSelectedEquipId(null)}
          showTransferActions={admin}
        />
      ) : null}
    </div>
  );
}
