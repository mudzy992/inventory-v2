import { writeStructuredLog } from '../logging/structured-log.util';
import { getCorrelationId } from '../utils/correlation-id.util';

export type UploadRejectOperation =
  | 'signed_transfer_pdf'
  | 'transfer_template_docx'
  | 'multipart';

export type UploadRejectReason =
  | 'missing_file'
  | 'invalid_mime'
  | 'invalid_signature'
  | 'size_limit'
  | 'missing_document_warehouse'
  | 'invalid_extension'
  | 'invalid_template'
  | 'missing_org_unit'
  | 'access_denied'
  | 'multipart_size_limit'
  | 'multipart_reject';

export type UploadRejectDetailValue = string | number | boolean | null;
export type UploadRejectDetails = Record<string, UploadRejectDetailValue>;

export interface UploadRejectEvent {
  operation: UploadRejectOperation;
  reason: UploadRejectReason;
  details?: UploadRejectDetails;
  correlationId?: string;
  at?: Date;
}

export interface UploadRejectCounters {
  total: number;
  byOperation: Record<string, number>;
  byReason: Record<string, number>;
}

export interface UploadRejectSnapshot {
  observedAt: string;
  startedAt: string;
  intervalStartedAt: string;
  intervalEndedAt: string;
  totalRejects: number;
  intervalRejects: number;
  byOperation: Record<string, number>;
  byReason: Record<string, number>;
  intervalByOperation: Record<string, number>;
  intervalByReason: Record<string, number>;
  lastRejectAt: string | null;
  lastReason: UploadRejectReason | null;
}

interface IntervalState extends UploadRejectCounters {
  startedAt: string;
}

interface RegistryState {
  startedAt: string;
  total: UploadRejectCounters;
  interval: IntervalState;
  lastRejectAt: string | null;
  lastReason: UploadRejectReason | null;
}

const emptyCounters = (): UploadRejectCounters => ({
  total: 0,
  byOperation: {},
  byReason: {},
});

const initialState = (at: Date = new Date()): RegistryState => {
  const timestamp = at.toISOString();
  return {
    startedAt: timestamp,
    total: emptyCounters(),
    interval: { ...emptyCounters(), startedAt: timestamp },
    lastRejectAt: null,
    lastReason: null,
  };
};

const increment = (counters: UploadRejectCounters, event: UploadRejectEvent): void => {
  counters.total += 1;
  counters.byOperation[event.operation] = (counters.byOperation[event.operation] ?? 0) + 1;
  counters.byReason[event.reason] = (counters.byReason[event.reason] ?? 0) + 1;
};

let state = initialState();
let emitLogs = true;

/** Disable per-reject lines in unit tests while keeping counter behavior. */
export const setUploadRejectLogEnabled = (enabled: boolean): void => {
  emitLogs = enabled;
};

export const recordUploadReject = (
  event: UploadRejectEvent,
  options: { emitLog?: boolean } = {},
): void => {
  const at = event.at ?? new Date();
  const timestamp = at.toISOString();
  increment(state.total, event);
  increment(state.interval, event);
  state.lastRejectAt = timestamp;
  state.lastReason = event.reason;

  if (options.emitLog ?? emitLogs) {
    const correlationId = event.correlationId ?? getCorrelationId();
    writeStructuredLog('warn', {
      ...(event.details ?? {}),
      event: 'upload_rejected',
      observedAt: timestamp,
      operation: event.operation,
      reason: event.reason,
      ...(correlationId ? { correlationId } : {}),
    });
  }
};

const buildSnapshot = (stateAtReport: RegistryState, endedAt: string): UploadRejectSnapshot => ({
  observedAt: endedAt,
  startedAt: stateAtReport.startedAt,
  intervalStartedAt: stateAtReport.interval.startedAt,
  intervalEndedAt: endedAt,
  totalRejects: stateAtReport.total.total,
  intervalRejects: stateAtReport.interval.total,
  byOperation: { ...stateAtReport.total.byOperation },
  byReason: { ...stateAtReport.total.byReason },
  intervalByOperation: { ...stateAtReport.interval.byOperation },
  intervalByReason: { ...stateAtReport.interval.byReason },
  lastRejectAt: stateAtReport.lastRejectAt,
  lastReason: stateAtReport.lastReason,
});

/** Periodic reporter drains only the interval counters; lifetime totals stay
 * available so a later report still shows the process-wide reject volume. */
export const uploadRejectRegistry = {
  record: recordUploadReject,
  snapshot: (at: Date = new Date()): UploadRejectSnapshot =>
    buildSnapshot(state, at.toISOString()),
  consumeSnapshot: (at: Date = new Date()): UploadRejectSnapshot => {
    const snapshot = buildSnapshot(state, at.toISOString());
    state.interval = { ...emptyCounters(), startedAt: at.toISOString() };
    return snapshot;
  },
  reset: (at: Date = new Date()): void => {
    state = initialState(at);
  },
};
