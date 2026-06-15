import { useCallback, useEffect, useState } from 'react';
import { fetchEligibleDisposalSessionsApi, markDisposalListApi } from '../../api/inventory-api';
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
  const [sessions, setSessions] = useState<
    { id: string; name: string; year: number }[]
  >([]);
  const [sessionId, setSessionId] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const eligibleSessions = await fetchEligibleDisposalSessionsApi(equipmentId);
      setSessions(eligibleSessions);
      if (eligibleSessions.length === 1) {
        setSessionId(eligibleSessions[0]!.id);
      } else {
        setSessionId('');
      }
    } catch {
      setSessions([]);
      setSessionId('');
    } finally {
      setLoading(false);
    }
  }, [equipmentId]);

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
    <ModalRoot
      open={open}
      onClose={onClose}
      size="md"
      zIndex={70}
      panelClassName="bg-white shadow-xl"
      title="Označi za rashod"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Odustani
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting || !sessionId}>
            {submitting ? 'Snimam…' : 'Dodaj na listu'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-600 mb-4">
        Oprema <strong>{inventoryNumber}</strong> bit će dodana na listu za rashod u odabranoj draft
        sesiji popisa.
      </p>
      {loading ? (
        <p className="text-sm text-gray-500">Učitavam sesije…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-amber-700">
          Nema draft sesije popisa u opsegu ove opreme (grad, skladište i kategorija).
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Sesija popisa</label>
            <select
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="">— Odaberite —</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name} ({session.year})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Napomena (opcionalno)</label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="Razlog ili kontekst za rashod"
            />
          </div>
        </div>
      )}
    </ModalRoot>
  );
};
