import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import {
  fetchDisposalListApi,
  withdrawDisposalListApi,
  type EquipmentDisposalListItemDto,
  type InventorySessionStatus,
} from '../../api/inventory-api';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { isAdmin } from '../../store';
import { AlertBanner } from '../ui/alert-banner';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { ResponsiveTable } from '../ui/responsive-table';
import { ModalRoot } from '../ui/modal-root';

interface DisposalListPanelProps {
  sessionId: string;
  sessionStatus: InventorySessionStatus;
}

const statusLabel: Record<EquipmentDisposalListItemDto['status'], string> = {
  listed: 'Na listi',
  withdrawn: 'Povučeno',
  assigned: 'Dodijeljeno komisiji',
  approved: 'Rashodovano',
  rejected: 'Odbijeno',
};

export const DisposalListPanel = ({ sessionId, sessionStatus }: DisposalListPanelProps) => {
  const admin = isAdmin();
  const { toastError, toastSuccess } = useToast();
  const [items, setItems] = useState<EquipmentDisposalListItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [withdrawTarget, setWithdrawTarget] = useState<EquipmentDisposalListItemDto | null>(null);
  const [withdrawNote, setWithdrawNote] = useState('');

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchDisposalListApi(sessionId);
      setItems(rows);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri učitavanju liste');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [sessionId, toastError]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const handleWithdraw = async () => {
    if (!withdrawTarget) {
      return;
    }
    try {
      await withdrawDisposalListApi(sessionId, withdrawTarget.equipmentId, {
        note: withdrawNote.trim() || undefined,
      });
      toastSuccess('Oprema je vraćena s liste za rashod.');
      setWithdrawTarget(null);
      setWithdrawNote('');
      await loadItems();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri povratu');
    }
  };

  const listedCount = items.filter((row) => row.status === 'listed').length;

  return (
    <div className="space-y-4">
      {sessionStatus === 'draft' ? (
        <AlertBanner tone="info">
          Evidentičar može označavati opremu za rashod dok je sesija u nacrtu. Pri kreiranju
          popisne komisije stavke se automatski dodjeljuju komisiji rashoda.
          {listedCount > 0 ? ` Trenutno ${listedCount} stavki čeka komisiju.` : ''}
        </AlertBanner>
      ) : (
        <AlertBanner tone="info">
          Lista za rashod je zaključana nakon aktivacije sesije. Nove stavke dodaje popisna komisija
          statusom „predložen rashod”.
        </AlertBanner>
      )}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-gray-900">Lista za rashod ({items.length})</h3>
        <Button variant="secondary" onClick={() => void loadItems()} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Osvježi
        </Button>
      </div>
      <ResponsiveTable
        isEmpty={items.length === 0 && !loading}
        emptyMessage="Nema stavki na listi za rashod."
        mobile={items.map((row) => (
          <div key={row.id} className="p-4 space-y-2">
            <p className="font-medium">{row.equipment?.inventoryNumber ?? '—'}</p>
            <p className="text-sm text-gray-600">{row.category?.name ?? '—'}</p>
            <Badge tone={row.status === 'listed' ? 'warning' : 'neutral'}>
              {statusLabel[row.status]}
            </Badge>
            {admin && sessionStatus === 'draft' && row.status === 'listed' ? (
              <Button variant="ghost" size="sm" onClick={() => setWithdrawTarget(row)}>
                Vrati s liste
              </Button>
            ) : null}
          </div>
        ))}
        desktop={
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Inventarni broj</th>
                <th className="text-left px-3 py-2 font-medium">Kategorija</th>
                <th className="text-left px-3 py-2 font-medium">Skladište</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-right px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-gray-50">
                  <td className="px-3 py-2">{row.equipment?.inventoryNumber ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {row.category?.name ?? row.equipment?.category?.name ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {row.warehouse?.name ?? row.equipment?.warehouse?.name ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={row.status === 'listed' ? 'warning' : 'neutral'}>
                      {statusLabel[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {admin && sessionStatus === 'draft' && row.status === 'listed' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setWithdrawTarget(row)}
                        aria-label="Vrati s liste"
                      >
                        <Trash2 size={14} />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
      {withdrawTarget ? (
        <ModalRoot open onClose={() => setWithdrawTarget(null)} size="md">
          <div className="p-6 space-y-4">
            <h3 className="text-lg font-semibold">Vrati s liste za rashod</h3>
            <p className="text-sm text-gray-600">
              Oprema {withdrawTarget.equipment?.inventoryNumber} ostaje na skladištu.
            </p>
            <textarea
              value={withdrawNote}
              onChange={(e) => setWithdrawNote(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-20"
              placeholder="Napomena (opcionalno)"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setWithdrawTarget(null)}>
                Odustani
              </Button>
              <Button onClick={() => void handleWithdraw()}>Potvrdi povrat</Button>
            </div>
          </div>
        </ModalRoot>
      ) : null}
    </div>
  );
};
