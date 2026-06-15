import { useCallback, useEffect, useState } from 'react';
import {
  fetchInventorySessionsPageApi,
  markDisposalListApi,
  type InventorySessionDto,
} from '../../api/inventory-api';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { Button } from '../ui/button';
import { ModalRoot } from '../ui/modal-root';

interface EquipmentMarkDisposalDialogProps {
  equipmentId: string;
  inventoryNumber: string;
  open: boolean;
  onClose: () => void;
  onMarked: () => void;
}

export const EquipmentMarkDisposalDialog = ({
  equipmentId,
  inventoryNumber,
  open,
  onClose,
  onMarked,
}: EquipmentMarkDisposalDialogProps) => {
  const { toastError, toastSuccess } = useToast();
  const [sessions, setSessions] = useState<InventorySessionDto[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchInventorySessionsPageApi({ page: 1, pageSize: 100 });
      const draftSessions = response.items.filter((row) => row.status === 'draft');
      setSessions(draftSessions);
      if (draftSessions.length === 1) {
        setSessionId(draftSessions[0]!.id);
      }
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadSessions();
    }
  }, [open, loadSessions]);

  const handleSubmit = async () => {
    if (!sessionId) {
      toastError('Odaberite sesiju popisa u nacrtu.');
      return;
    }
    setSubmitting(true);
    try {
      await markDisposalListApi(sessionId, { equipmentId, note: note.trim() || undefined });
      toastSuccess(`Oprema ${inventoryNumber} je dodana na listu za rashod.`);
      onMarked();
      onClose();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri označavanju za rashod');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalRoot open={open} onClose={onClose} size="md">
      <div className="p-6 space-y-4">
        <h3 className="text-lg font-semibold">Označi za rashod</h3>
        <p className="text-sm text-gray-600">
          Oprema {inventoryNumber} ide na listu za rashod u odabranoj sesiji. Zadužena oprema se
          automatski razdužuje na skladište.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sesija popisa (nacrt)</label>
          <select
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            disabled={loading || sessions.length === 0}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">— Odaberi sesiju —</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name} ({session.year})
              </option>
            ))}
          </select>
          {!loading && sessions.length === 0 ? (
            <p className="text-xs text-amber-700 mt-1">
              Nema aktivnih nacrta sesije. Administrator mora kreirati sesiju popisa.
            </p>
          ) : null}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Napomena</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-20"
            placeholder="Opcionalno"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Odustani
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting || !sessionId}>
            {submitting ? 'Spremanje…' : 'Dodaj na listu'}
          </Button>
        </div>
      </div>
    </ModalRoot>
  );
};
