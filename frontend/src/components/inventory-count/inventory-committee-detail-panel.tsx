import { Pencil, Printer, Square, Trash2 } from 'lucide-react';
import type {
  InventoryCommitteeDto,
  InventoryLineDto,
  InventoryPrintScopeDto,
  InventorySessionDto,
} from '../../api/inventory-api';
import type { Equipment } from '../../types';
import { getCommitteeDisplayLabel } from './inventory-committee-label.util';
import { SessionLinesPanel } from './session-lines-panel';
import { AlertBanner } from '../ui/alert-banner';
import { Button } from '../ui/button';
import { FormCard } from '../ui/form-card';

interface InventoryCommitteeDetailPanelProps {
  session: InventorySessionDto;
  committee: InventoryCommitteeDto | null;
  committeeId: string;
  printScope: InventoryPrintScopeDto | null;
  scopeEquipment: Equipment[];
  scopeReady?: boolean;
  lines: InventoryLineDto[];
  canCloseCommittee: boolean;
  closeCommitteeBlockedReason?: string;
  canManage?: boolean;
  showAdminLines?: boolean;
  onPrint: () => void;
  onReport?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCloseCommittee?: () => void;
  onLineSaved: () => void | Promise<void>;
}

export const InventoryCommitteeDetailPanel = ({
  session,
  committee,
  committeeId,
  printScope,
  scopeEquipment,
  scopeReady = false,
  lines,
  canCloseCommittee,
  closeCommitteeBlockedReason,
  canManage = false,
  showAdminLines = false,
  onPrint,
  onReport,
  onEdit,
  onDelete,
  onCloseCommittee,
  onLineSaved,
}: InventoryCommitteeDetailPanelProps) => {
  if (!committee || !committeeId) {
    return (
      <FormCard title="Detalj komisije">
        <AlertBanner tone="info">Odaberite popisnu komisiju sa liste.</AlertBanner>
      </FormCard>
    );
  }
  const committeeFromScope = printScope?.committee ?? committee;
  return (
    <FormCard title="Detalj komisije">
      <div className="space-y-1">
        <p className="text-sm font-medium text-gray-900">{getCommitteeDisplayLabel(committee)}</p>
        <p className="text-xs text-gray-500">
          {session.orgUnit?.name ?? session.orgUnitId} · {session.name} · {session.year}
        </p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-100 p-3">
          <p className="text-xs font-medium text-gray-500 mb-2">Popisna komisija</p>
          <ul className="text-sm text-gray-800 space-y-1">
            {committee.members.map((member) => (
              <li key={member.employeeId}>
                {member.employee?.firstName} {member.employee?.lastName}
                <span className="text-xs text-gray-500 ml-1">
                  ({member.role === 'predsjednik' ? 'predsjednik' : 'član'})
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-gray-100 p-3">
          <p className="text-xs font-medium text-gray-500 mb-2">Komisija rashoda</p>
          {committee.disposalCommission?.members?.length ? (
            <ul className="text-sm text-gray-800 space-y-1">
              {committee.disposalCommission.members.map((member) => (
                <li key={member.employeeId}>
                  {member.employee?.firstName} {member.employee?.lastName}
                  <span className="text-xs text-gray-500 ml-1">
                    ({member.role === 'predsjednik' ? 'predsjednik' : 'član'})
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">—</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        {canManage && onEdit ? (
          <Button variant="secondary" onClick={onEdit}>
            <Pencil size={14} />
            Uredi komisiju
          </Button>
        ) : null}
        {canManage && onDelete ? (
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={14} />
            Obriši komisiju
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onPrint} disabled={!scopeReady && !printScope}>
          <Printer size={14} />
          Štampaj popisnu listu
        </Button>
        {onReport ? (
          <Button variant="secondary" onClick={onReport} disabled={!committeeId}>
            <Printer size={14} />
            Zapisnik
          </Button>
        ) : null}
        {canCloseCommittee && onCloseCommittee ? (
          <Button variant="danger" onClick={onCloseCommittee} disabled={!scopeReady && !printScope}>
            <Square size={14} />
            Zaključi listu
          </Button>
        ) : null}
      </div>
      {closeCommitteeBlockedReason ? (
        <AlertBanner tone="info">{closeCommitteeBlockedReason}</AlertBanner>
      ) : null}
      {scopeReady || printScope ? (
        <>
          <p className="text-xs text-gray-500 mt-3">
            Oprema u opsegu: <strong>{scopeEquipment.length}</strong>
          </p>
          {!showAdminLines || session.status === 'active' ? (
            <SessionLinesPanel
              key={`${committeeId}-${(session.committees ?? []).length}`}
              committeeId={committeeId}
              isCommitteeClosed={Boolean(committeeFromScope?.isClosed)}
              session={session}
              lines={lines}
              equipment={scopeEquipment}
              onLineSaved={async () => {
                await onLineSaved();
              }}
            />
          ) : (
            <AlertBanner tone="info" className="mt-3">
              Unos linija dostupan je nakon aktivacije sesije.
            </AlertBanner>
          )}
        </>
      ) : (
        <AlertBanner tone="info" className="mt-3">
          Učitavam opseg komisije…
        </AlertBanner>
      )}
    </FormCard>
  );
};
