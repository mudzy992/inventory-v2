import { Pencil, Trash2 } from 'lucide-react';
import type { InventorySessionDto } from '../../api/inventory-api';
import { formatDate } from '../../helpers';
import { computeInventorySessionStats } from './inventory-session-stats.util';
import {
  getInventorySessionStatusLabel,
  getInventorySessionStatusTone,
} from './inventory-labels';
import { Badge } from '../ui/badge';
import { FormCard } from '../ui/form-card';

interface InventorySessionListPanelProps {
  sessions: InventorySessionDto[];
  selectedSessionId: string;
  onSelect: (sessionId: string) => void;
}

export const InventorySessionListPanel = ({
  sessions,
  selectedSessionId,
  onSelect,
}: InventorySessionListPanelProps) => (
  <FormCard title="Sesije popisa">
    {sessions.length === 0 ? (
      <p className="text-sm text-gray-500">Nema sesija.</p>
    ) : (
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 overflow-hidden">
        {sessions.map((session) => {
          const stats = computeInventorySessionStats(session);
          const period =
            session.startDate && session.endDate
              ? `${formatDate(session.startDate)} – ${formatDate(session.endDate)}`
              : 'Period nije postavljen';
          const isSelected = session.id === selectedSessionId;
          return (
            <button
              key={session.id}
              type="button"
              className={`w-full text-left px-3 py-3 hover:bg-gray-50 ${isSelected ? 'bg-blue-50/70' : 'bg-white'}`}
              onClick={() => onSelect(session.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{session.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{session.year} · {period}</p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {stats.closedCommittees}/{stats.totalCommittees} komisija · {stats.recordedLines} linija
                  </p>
                </div>
                <Badge tone={getInventorySessionStatusTone(session.status)}>
                  {getInventorySessionStatusLabel(session.status)}
                </Badge>
              </div>
            </button>
          );
        })}
      </div>
    )}
  </FormCard>
);

interface InventoryCommitteeListPanelProps {
  committees: InventorySessionDto['committees'];
  selectedCommitteeId: string;
  sessionStatus: InventorySessionDto['status'];
  onSelect: (committeeId: string) => void;
  onEdit?: (committeeId: string) => void;
  onDelete?: (committeeId: string) => void;
}

export const InventoryCommitteeListPanel = ({
  committees,
  selectedCommitteeId,
  sessionStatus,
  onSelect,
  onEdit,
  onDelete,
}: InventoryCommitteeListPanelProps) => {
  const canManage = sessionStatus === 'draft';
  const grouped = new Map<string, NonNullable<InventorySessionDto['committees']>>();
  for (const committee of committees ?? []) {
    const key = committee.warehouse?.name ?? committee.warehouseId ?? 'Bez skladišta';
    const rows = grouped.get(key) ?? [];
    rows.push(committee);
    grouped.set(key, rows);
  }
  return (
    <FormCard title="Popisne komisije">
      {(committees ?? []).length === 0 ? (
        <p className="text-sm text-gray-500">Nema definisanih komisija.</p>
      ) : (
        <div className="space-y-4">
          {[...grouped.entries()].map(([warehouseName, rows]) => (
            <div key={warehouseName}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{warehouseName}</p>
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 overflow-hidden">
                {rows.map((committee) => {
                  const isSelected = committee.id === selectedCommitteeId;
                  return (
                    <div
                      key={committee.id}
                      className={`flex items-center gap-1 ${isSelected ? 'bg-blue-50/70' : 'bg-white'}`}
                    >
                      <button
                        type="button"
                        className="flex-1 text-left px-3 py-2.5 hover:bg-gray-50 min-w-0"
                        onClick={() => onSelect(committee.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-gray-900 truncate">
                            {committee.category?.name ?? committee.categoryId}
                          </span>
                          {committee.isClosed ? (
                            <Badge tone="neutral">Zaključeno</Badge>
                          ) : (
                            <Badge tone="info">Aktivno</Badge>
                          )}
                        </div>
                      </button>
                      {canManage ? (
                        <div className="flex shrink-0 gap-0.5 pr-2">
                          {onEdit ? (
                            <button
                              type="button"
                              className="p-1.5 text-gray-500 hover:text-blue-700"
                              aria-label="Uredi komisiju"
                              onClick={() => onEdit(committee.id)}
                            >
                              <Pencil size={14} />
                            </button>
                          ) : null}
                          {onDelete ? (
                            <button
                              type="button"
                              className="p-1.5 text-gray-500 hover:text-red-700"
                              aria-label="Obriši komisiju"
                              onClick={() => onDelete(committee.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </FormCard>
  );
};
