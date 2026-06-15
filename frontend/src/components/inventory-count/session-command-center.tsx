import { Play, RefreshCw, Square, Trash2 } from 'lucide-react';
import type { InventorySessionCloseJobDto, InventorySessionDto } from '../../api/inventory-api';
import { formatDate } from '../../helpers';
import { Button } from '../ui/button';
import { FormCard } from '../ui/form-card';
import {
  getInventorySessionStatusLabel,
  getInventorySessionStatusTone,
} from './inventory-labels';
import { Badge } from '../ui/badge';
import type { InventorySessionStats } from './inventory-session-stats.util';

interface SessionCommandCenterProps {
  session: InventorySessionDto;
  stats: InventorySessionStats;
  scopeTotal?: number;
  closeJob: InventorySessionCloseJobDto | null;
  loading: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onDelete?: (id: string) => void;
  onRefresh: () => void;
  canManageLifecycle?: boolean;
}

export const SessionCommandCenter = ({
  session,
  stats,
  scopeTotal,
  closeJob,
  loading,
  onActivate,
  onClose,
  onDelete,
  onRefresh,
  canManageLifecycle = true,
}: SessionCommandCenterProps) => {
  const canDeleteSession = session.status === 'draft';
  const period =
    session.startDate && session.endDate
      ? `${formatDate(session.startDate)} – ${formatDate(session.endDate)}`
      : 'Period nije postavljen';
  const progressPct =
    scopeTotal && scopeTotal > 0
      ? Math.round((stats.recordedLines / scopeTotal) * 100)
      : null;
  const closeProgress =
    closeJob && closeJob.totalCount > 0
      ? Math.round((closeJob.appliedCount / closeJob.totalCount) * 100)
      : 0;
  return (
    <FormCard title="Command center — sesija popisa">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">{session.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Godina {session.year} · {period}
          </p>
          <div className="mt-2">
            <Badge tone={getInventorySessionStatusTone(session.status)}>
              {getInventorySessionStatusLabel(session.status)}
            </Badge>
          </div>
        </div>
        <Button variant="secondary" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Osvježi
        </Button>
      </div>
      <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <dt className="text-[10px] uppercase text-gray-500">Komisije</dt>
          <dd className="text-sm font-semibold text-gray-900">
            {session.status === 'draft'
              ? `${stats.configuredCommittees}/${stats.totalCommittees}`
              : `${stats.closedCommittees}/${stats.totalCommittees}`}
          </dd>
          <dd className="text-[10px] text-gray-500">
            {session.status === 'draft' ? 'konfigurisano' : 'zatvoreno'}
          </dd>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <dt className="text-[10px] uppercase text-gray-500">Linije</dt>
          <dd className="text-sm font-semibold text-gray-900">{stats.recordedLines}</dd>
          <dd className="text-[10px] text-gray-500">snimljeno</dd>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <dt className="text-[10px] uppercase text-gray-500">Prenosnice</dt>
          <dd className="text-sm font-semibold text-amber-800">{stats.transferPendingCount}</dd>
          <dd className="text-[10px] text-gray-500">čeka upload</dd>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <dt className="text-[10px] uppercase text-gray-500">Greške</dt>
          <dd className="text-sm font-semibold text-red-700">{stats.failedCount}</dd>
          <dd className="text-[10px] text-gray-500">primjena</dd>
        </div>
      </dl>
      {progressPct !== null ? (
        <p className="text-xs text-gray-600 mt-3">
          Evidentirano u odabranoj komisiji: <strong>{progressPct}%</strong> ({stats.recordedLines}/
          {scopeTotal})
        </p>
      ) : null}
      {session.status === 'closing' && closeJob ? (
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-xs text-gray-600">
            <span>Obrada zatvaranja: {closeJob.status}</span>
            <span>
              {closeJob.appliedCount}/{closeJob.totalCount}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden" role="progressbar">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${closeProgress}%` }}
            />
          </div>
          {closeJob.failedCount > 0 ? (
            <p className="text-xs text-red-700">
              {closeJob.failedCount} grešaka pri primjeni — provjerite linije sa statusom „Neuspješno”.
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 mt-4">
        {canManageLifecycle && session.status === 'draft' ? (
          <Button variant="secondary" onClick={() => onActivate(session.id)}>
            <Play size={14} />
            Aktiviraj sesiju
          </Button>
        ) : null}
        {canManageLifecycle && canDeleteSession && onDelete ? (
          <Button
            variant="danger"
            onClick={() => onDelete(session.id)}
            disabled={loading}
          >
            <Trash2 size={14} />
            Obriši sesiju
          </Button>
        ) : null}
        {session.status === 'draft' && stats.configuredCommittees < stats.totalCommittees ? (
          <p className="text-xs text-amber-700 self-center">
            {stats.totalCommittees - stats.configuredCommittees} slotova čeka dodjelu članova prije aktivacije.
          </p>
        ) : null}
        {canManageLifecycle && session.status === 'active' ? (
          <Button variant="danger" onClick={() => onClose(session.id)}>
            <Square size={14} />
            Zatvori sesiju popisa
          </Button>
        ) : null}
      </div>
    </FormCard>
  );
};
