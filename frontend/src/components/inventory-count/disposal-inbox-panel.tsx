import { useCallback, useEffect, useState } from 'react';
import {
  fetchDisposalInboxApi,
  reviewDisposalApprovalApi,
  type DisposalInventoryApprovalDto,
} from '../../api/inventory-api';
import { ApiError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/toast-context';
import { useInventorySocketEvents } from '../../hooks/use-inventory-socket-events';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { cardClass } from '../ui/form-styles';

interface DisposalInboxPanelProps {
  sessionId: string;
  sessionStatus: string;
}

export const DisposalInboxPanel = ({ sessionId, sessionStatus }: DisposalInboxPanelProps) => {
  const { user } = useAuth();
  const { toastError, toastSuccess } = useToast();
  const [items, setItems] = useState<DisposalInventoryApprovalDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    if (sessionStatus !== 'closed' && sessionStatus !== 'closing') {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchDisposalInboxApi(sessionId);
      setItems(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Greška pri učitavanju');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [sessionId, sessionStatus]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);
  useInventorySocketEvents({
    sessionId,
    onDisposalInboxUpdated: () => void loadInbox(),
  });

  const handleReview = async (approvalId: string, approved: boolean) => {
    const rejectionNote = approved ? '' : (window.prompt('Razlog odbijanja:') ?? '');
    if (!approved && !rejectionNote.trim()) {
      return;
    }
    try {
      await reviewDisposalApprovalApi(approvalId, {
        approved,
        note: approved ? undefined : rejectionNote,
      });
      await loadInbox();
      toastSuccess(approved ? 'Rashod je odobren.' : 'Rashod je odbijen.');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška';
      setError(message);
      toastError(message);
    }
  };

  if (sessionStatus !== 'closed' && sessionStatus !== 'closing') {
    return null;
  }

  return (
    <div className={`${cardClass} p-4 space-y-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium text-gray-900">Inbox komisije rashoda</h3>
        <Badge tone="info">Popisni rashod</Badge>
      </div>
      {loading ? <p className="text-xs text-gray-500">Učitavanje…</p> : null}
      {!user?.employeeId ? (
        <p className="text-xs text-gray-600">
          Inbox komisije rashoda dostupan je predsjedniku komisije (korisnik mora biti povezan s radnikom).
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      {!loading && items.length === 0 ? (
        <p className="text-sm text-gray-600">Nema stavki na čekanju.</p>
      ) : null}
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-gray-100 rounded-lg p-3"
          >
            <div>
              <p className="text-sm font-medium">{item.equipment?.inventoryNumber}</p>
              <p className="text-xs text-gray-500">
                {item.equipment?.category?.name} · {item.equipment?.warehouse?.name ?? '—'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" className="text-xs h-8" onClick={() => void handleReview(item.id, true)}>
                Odobri
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-xs h-8"
                onClick={() => void handleReview(item.id, false)}
              >
                Odbij
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
