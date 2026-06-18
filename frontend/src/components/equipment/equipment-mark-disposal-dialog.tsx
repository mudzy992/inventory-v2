import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { fetchEligibleDisposalSessionsApi, markDisposalListApi } from '../../api/inventory-api';
import { ApiError } from '../../api/client';
import { canMarkDisposalList, DISPOSAL_GUARD_MESSAGES } from '../../helpers/guards';
import { useToast } from '../../contexts/toast-context';
import { Button } from '../ui/button';
import { inputClass, labelClass, selectClass } from '../ui/form-styles';
import { ModalRoot } from '../ui/modal-root';
import { MODAL_Z } from '../../constants/modal-z-index';

interface EquipmentMarkDisposalDialogProps {
  equipmentId: string;
  inventoryNumber: string;
  equipmentStatus: string;
  warehouseId?: string | null;
  open: boolean;
  onClose: () => void;
  onMarked: () => void;
}

export const EquipmentMarkDisposalDialog = ({
  equipmentId,
  inventoryNumber,
  equipmentStatus,
  warehouseId,
  open,
  onClose,
  onMarked,
}: EquipmentMarkDisposalDialogProps) => {
  const { toastError, toastSuccess } = useToast();
  const [sessions, setSessions] = useState<{ id: string; name: string; year: number }[]>([]);
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
      setNote('');
      void loadSessions();
    }
  }, [open, loadSessions]);

  const handleSubmit = async () => {
    const markGuard = canMarkDisposalList({
      sessionStatus: 'draft',
      equipmentStatus,
      warehouseId,
    });
    if (!markGuard.allowed) {
      toastError(markGuard.reason ?? 'Označavanje nije dozvoljeno.');
      return;
    }
    if (!sessionId) {
      toastError('Odaberite sesiju popisa u nacrtu.');
      return;
    }
    const trimmedNote = note.trim();
    if (trimmedNote.length < 3) {
      toastError('Unesite razlog rashoda (najmanje 3 znaka).');
      return;
    }
    setSubmitting(true);
    try {
      await markDisposalListApi(sessionId, { equipmentId, note: trimmedNote });
      toastSuccess(`Oprema ${inventoryNumber} je dodana na listu za rashod.`);
      onMarked();
      onClose();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri označavanju za rashod');
    } finally {
      setSubmitting(false);
    }
  };

  const isWarehouseReady =
    equipmentStatus === 'skladiste' && !!warehouseId;

  return (
    <ModalRoot
      open={open}
      onClose={onClose}
      size="md"
      zIndex={MODAL_Z.destructive}
      enableEscape
      closeOnBackdrop
    >
      <div className="bg-white rounded-xl shadow-2xl w-full p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Označi za rashod</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
            aria-label="Zatvori"
            disabled={submitting}
          >
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Oprema <strong>{inventoryNumber}</strong> mora biti na skladištu. Ako je zadužena, prvo je
          razdužite preko prenosnice, zatim je dodajte na listu za rashod u draft sesiji popisa.
        </p>
        {equipmentStatus !== 'skladiste' || !warehouseId ? (
          <p className="text-sm text-amber-700">{DISPOSAL_GUARD_MESSAGES.disposalRequiresWarehouse}</p>
        ) : loading ? (
          <p className="text-sm text-gray-500">Učitavam sesije…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-amber-700">
            Nema draft sesije popisa u opsegu ove opreme (skladište i kategorija). Provjerite da
            sesija ima slotove za ovo skladište.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Sesija popisa</label>
              <select
                value={sessionId}
                onChange={(event) => setSessionId(event.target.value)}
                className={selectClass}
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
              <label className={labelClass}>
                Razlog rashoda <span className="text-red-500">*</span>
              </label>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                className={inputClass}
                placeholder="Obrazložite zašto se oprema predlaže za rashod"
                required
                minLength={3}
              />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Odustani
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={
              submitting ||
              !isWarehouseReady ||
              !sessionId ||
              sessions.length === 0 ||
              note.trim().length < 3
            }
          >
            {submitting ? 'Snimam…' : 'Dodaj na listu'}
          </Button>
        </div>
      </div>
    </ModalRoot>
  );
};
