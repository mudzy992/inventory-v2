export const INVENTORY_CLOSE_METRICS_INTERVAL_MS = 30_000;
export const INVENTORY_CLOSE_WARN_PENDING_COUNT = 10;
export const INVENTORY_CLOSE_WARN_QUEUED_AGE_SECONDS = 300;
export const INVENTORY_CLOSE_WARN_RUNNING_AGE_SECONDS = 1_800;
export const INVENTORY_CLOSE_WARN_FAILED_AGE_SECONDS = 300;

export type InventoryCloseJobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface InventoryCloseMetricsThresholds {
  warnPendingCount: number;
  warnQueuedAgeSeconds: number;
  warnRunningAgeSeconds: number;
  warnFailedAgeSeconds: number;
}

export const DEFAULT_INVENTORY_CLOSE_METRICS_THRESHOLDS: InventoryCloseMetricsThresholds = {
  warnPendingCount: INVENTORY_CLOSE_WARN_PENDING_COUNT,
  warnQueuedAgeSeconds: INVENTORY_CLOSE_WARN_QUEUED_AGE_SECONDS,
  warnRunningAgeSeconds: INVENTORY_CLOSE_WARN_RUNNING_AGE_SECONDS,
  warnFailedAgeSeconds: INVENTORY_CLOSE_WARN_FAILED_AGE_SECONDS,
};

/** Raw `groupBy` output. Only counts and timestamps cross this boundary —
 * no session IDs, actor IDs, error text or inventory line data. */
export interface InventoryCloseStatusGroup {
  status: InventoryCloseJobStatus;
  count: number;
  oldestCreatedAt: Date | null;
  oldestStartedAt: Date | null;
  oldestUpdatedAt: Date | null;
}

export interface InventoryCloseMetricsSnapshot extends InventoryCloseMetricsThresholds {
  observedAt: string;
  queued: number;
  running: number;
  done: number;
  failed: number;
  pending: number;
  expiredLeaseCount: number;
  oldestQueuedAgeSeconds: number;
  oldestRunningAgeSeconds: number;
  oldestFailedAgeSeconds: number;
}

export type InventoryCloseMetricsReason =
  | 'pending_backlog'
  | 'queued_age'
  | 'running_age'
  | 'expired_lease'
  | 'failed_age';

export interface InventoryCloseMetricsEvaluation {
  level: 'log' | 'warn';
  reasons: InventoryCloseMetricsReason[];
}

export const ageSecondsFromDate = (value: Date | null | undefined, now: Date): number => {
  if (!value || !Number.isFinite(value.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - value.getTime()) / 1_000));
};

export const buildInventoryCloseMetricsSnapshot = (input: {
  groups: InventoryCloseStatusGroup[];
  expiredLeaseCount: number;
  now: Date;
  thresholds: InventoryCloseMetricsThresholds;
}): InventoryCloseMetricsSnapshot => {
  const byStatus = new Map<InventoryCloseJobStatus, InventoryCloseStatusGroup>(
    input.groups.map((group) => [group.status, group]),
  );
  const normalizeCount = (value: number): number =>
    Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const countOf = (status: InventoryCloseJobStatus): number =>
    normalizeCount(byStatus.get(status)?.count ?? 0);
  const queuedGroup = byStatus.get('queued');
  const runningGroup = byStatus.get('running');
  const failedGroup = byStatus.get('failed');
  const queued = countOf('queued');
  const running = countOf('running');
  const failed = countOf('failed');
  const done = countOf('done');

  return {
    observedAt: input.now.toISOString(),
    queued,
    running,
    done,
    failed,
    pending: queued + running,
    expiredLeaseCount: normalizeCount(input.expiredLeaseCount),
    oldestQueuedAgeSeconds: ageSecondsFromDate(queuedGroup?.oldestCreatedAt, input.now),
    oldestRunningAgeSeconds: ageSecondsFromDate(
      runningGroup?.oldestStartedAt ?? runningGroup?.oldestCreatedAt,
      input.now,
    ),
    // Manual admin retry resets the status, so any still-failed row is an
    // unresolved close. `createdAt` measures how long the close request has
    // been outstanding; `updatedAt` is only a fallback for sparse aggregates.
    oldestFailedAgeSeconds: ageSecondsFromDate(
      failedGroup?.oldestCreatedAt ?? failedGroup?.oldestUpdatedAt,
      input.now,
    ),
    ...input.thresholds,
  };
};

export const evaluateInventoryCloseMetrics = (
  snapshot: InventoryCloseMetricsSnapshot,
): InventoryCloseMetricsEvaluation => {
  const reasons: InventoryCloseMetricsReason[] = [];
  if (snapshot.pending >= snapshot.warnPendingCount) {
    reasons.push('pending_backlog');
  }
  if (snapshot.queued > 0 && snapshot.oldestQueuedAgeSeconds >= snapshot.warnQueuedAgeSeconds) {
    reasons.push('queued_age');
  }
  if (snapshot.running > 0 && snapshot.oldestRunningAgeSeconds >= snapshot.warnRunningAgeSeconds) {
    reasons.push('running_age');
  }
  if (snapshot.expiredLeaseCount > 0) {
    reasons.push('expired_lease');
  }
  if (snapshot.failed > 0 && snapshot.oldestFailedAgeSeconds >= snapshot.warnFailedAgeSeconds) {
    reasons.push('failed_age');
  }
  return { level: reasons.length > 0 ? 'warn' : 'log', reasons };
};
