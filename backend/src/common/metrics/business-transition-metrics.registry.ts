/**
 * Process-local counters for conditional business state transitions.
 * Compare-and-set writes (`updateMany where status=...`) either apply or are
 * rejected as stale/duplicate. Only bounded labels are kept: operation,
 * `from -> to` status pair, outcome and terminal result. No entity IDs,
 * user IDs, error text or business payloads are ever stored.
 */

export const BUSINESS_METRICS_MAX_OPERATIONS = 24;
export const BUSINESS_METRICS_MAX_TRANSITIONS = 64;
export const BUSINESS_METRICS_OVERFLOW = 'other';

export type BusinessTransitionOutcome = 'applied' | 'rejected';
export type BusinessTransitionTerminal = 'none' | 'done' | 'failed';

const OUTCOMES: readonly BusinessTransitionOutcome[] = ['applied', 'rejected'];

export const normalizeBusinessLabel = (value: string, maxLength = 32): string => {
  const normalized = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_.:>-]/gu, '_')
    .slice(0, maxLength);
  return normalized.length > 0 ? normalized : BUSINESS_METRICS_OVERFLOW;
};

/** Read a plain string `status` out of a Prisma update payload. Composite
 * field updates (e.g. `{ set: 'done' }`) are reported as `unknown` rather
 * than serialising a potentially large or sensitive object. */
export const readTransitionTargetStatus = (data: unknown): string => {
  if (!data || typeof data !== 'object' || !('status' in data)) return 'unchanged';
  const value = (data as { status?: unknown }).status;
  return typeof value === 'string' ? value : 'unknown';
};

export interface BusinessTransitionEvent {
  operation: string;
  outcome: BusinessTransitionOutcome;
  fromStatus?: string;
  toStatus?: string;
  terminal?: BusinessTransitionTerminal;
  at?: Date;
}

export interface BusinessTransitionMetricsSnapshot {
  observedAt: string;
  startedAt: string;
  intervalStartedAt: string;
  intervalEndedAt: string;
  totalTransitions: number;
  intervalTransitions: number;
  applied: number;
  rejected: number;
  rejectedRatePercent: number;
  terminalDone: number;
  terminalFailed: number;
  byOutcome: Record<BusinessTransitionOutcome, number>;
  byOperation: Record<string, number>;
  byTransition: Record<string, number>;
  consecutiveRejections: number;
  maxConsecutiveRejections: number;
  secondsSinceLastRejection: number | null;
  lastRejectionAt: string | null;
  lastRejectedOperation: string | null;
  overflowOperations: number;
  overflowTransitions: number;
}

interface Counters {
  total: number;
  byOutcome: Record<BusinessTransitionOutcome, number>;
  byOperation: Record<string, number>;
  byTransition: Record<string, number>;
  terminalDone: number;
  terminalFailed: number;
  overflowOperations: number;
  overflowTransitions: number;
}

interface IntervalCounters extends Counters {
  startedAt: string;
}

interface RegistryState {
  startedAt: string;
  total: Counters;
  interval: IntervalCounters;
  consecutiveRejections: number;
  maxConsecutiveRejections: number;
  lastRejectionAt: string | null;
  lastRejectedOperation: string | null;
}

const emptyCounters = (): Counters => ({
  total: 0,
  byOutcome: Object.fromEntries(OUTCOMES.map((name) => [name, 0])) as Record<
    BusinessTransitionOutcome,
    number
  >,
  byOperation: {},
  byTransition: {},
  terminalDone: 0,
  terminalFailed: 0,
  overflowOperations: 0,
  overflowTransitions: 0,
});

const initialState = (at: Date = new Date()): RegistryState => {
  const timestamp = at.toISOString();
  return {
    startedAt: timestamp,
    total: emptyCounters(),
    interval: { ...emptyCounters(), startedAt: timestamp },
    consecutiveRejections: 0,
    maxConsecutiveRejections: 0,
    lastRejectionAt: null,
    lastRejectedOperation: null,
  };
};

const safeTimestamp = (at: Date | undefined): string =>
  at && Number.isFinite(at.getTime()) ? at.toISOString() : new Date().toISOString();

const increment = (counters: Counters, event: BusinessTransitionEvent): string => {
  counters.total += 1;
  counters.byOutcome[event.outcome] += 1;

  const operation = normalizeBusinessLabel(event.operation);
  let operationKey = operation;
  if (!counters.byOperation[operationKey]) {
    if (Object.keys(counters.byOperation).length >= BUSINESS_METRICS_MAX_OPERATIONS) {
      operationKey = BUSINESS_METRICS_OVERFLOW;
      counters.overflowOperations += 1;
    }
  }
  counters.byOperation[operationKey] = (counters.byOperation[operationKey] ?? 0) + 1;

  const fromStatus = normalizeBusinessLabel(event.fromStatus ?? 'unknown', 24);
  const toStatus = normalizeBusinessLabel(event.toStatus ?? 'unknown', 24);
  const transition = `${fromStatus}->${toStatus}`;
  let transitionKey = transition;
  if (!counters.byTransition[transitionKey]) {
    if (Object.keys(counters.byTransition).length >= BUSINESS_METRICS_MAX_TRANSITIONS) {
      transitionKey = `${BUSINESS_METRICS_OVERFLOW}->${BUSINESS_METRICS_OVERFLOW}`;
      counters.overflowTransitions += 1;
    }
  }
  counters.byTransition[transitionKey] = (counters.byTransition[transitionKey] ?? 0) + 1;

  // Only a compare-and-set that actually matched produces a business outcome;
  // a stale duplicate must not inflate terminal success/failure counts.
  if (event.outcome === 'applied') {
    if (event.terminal === 'done') counters.terminalDone += 1;
    if (event.terminal === 'failed') counters.terminalFailed += 1;
  }

  return operationKey;
};

let state = initialState();

/** Never throws: observability must not influence a business transaction. */
export const recordBusinessTransition = (event: BusinessTransitionEvent): void => {
  try {
    const timestamp = safeTimestamp(event.at);
    const operation = increment(state.total, event);
    increment(state.interval, event);
    if (event.outcome === 'rejected') {
      state.consecutiveRejections += 1;
      state.maxConsecutiveRejections = Math.max(
        state.maxConsecutiveRejections,
        state.consecutiveRejections,
      );
      state.lastRejectionAt = timestamp;
      state.lastRejectedOperation = operation;
    } else {
      state.consecutiveRejections = 0;
    }
  } catch {
    // Bounded counters are best-effort; a serialization issue must never
    // abort the surrounding DB transaction.
  }
};

/** Convenience wrapper for `updateMany(...).count` compare-and-set results. */
export const recordConditionalTransition = (
  operation: string,
  count: number,
  options: {
    fromStatus?: string;
    toStatus?: string;
    terminal?: BusinessTransitionTerminal;
    expectedCount?: number;
    at?: Date;
  } = {},
): void => {
  const expected = options.expectedCount ?? 1;
  recordBusinessTransition({
    operation,
    outcome: count === expected ? 'applied' : 'rejected',
    fromStatus: options.fromStatus,
    toStatus: options.toStatus,
    terminal: options.terminal,
    at: options.at,
  });
};

const buildSnapshot = (
  stateAtReport: RegistryState,
  endedAt: string,
): BusinessTransitionMetricsSnapshot => {
  const total = stateAtReport.total;
  const interval = stateAtReport.interval;
  const rejectedRatePercent =
    interval.total === 0
      ? 0
      : Math.round((interval.byOutcome.rejected / interval.total) * 10_000) / 100;
  const secondsSinceLastRejection = stateAtReport.lastRejectionAt
    ? Math.max(
        0,
        Math.floor(
          (Date.parse(endedAt) - Date.parse(stateAtReport.lastRejectionAt)) / 1_000,
        ),
      )
    : null;

  return {
    observedAt: endedAt,
    startedAt: stateAtReport.startedAt,
    intervalStartedAt: interval.startedAt,
    intervalEndedAt: endedAt,
    totalTransitions: total.total,
    intervalTransitions: interval.total,
    applied: interval.byOutcome.applied,
    rejected: interval.byOutcome.rejected,
    rejectedRatePercent,
    terminalDone: interval.terminalDone,
    terminalFailed: interval.terminalFailed,
    byOutcome: { ...interval.byOutcome },
    byOperation: { ...interval.byOperation },
    byTransition: { ...interval.byTransition },
    consecutiveRejections: stateAtReport.consecutiveRejections,
    maxConsecutiveRejections: stateAtReport.maxConsecutiveRejections,
    secondsSinceLastRejection,
    lastRejectionAt: stateAtReport.lastRejectionAt,
    lastRejectedOperation: stateAtReport.lastRejectedOperation,
    overflowOperations: interval.overflowOperations,
    overflowTransitions: interval.overflowTransitions,
  };
};

/** The periodic reporter drains only the interval; lifetime totals and the
 * rejection streak remain visible across reports. */
export const businessTransitionMetricsRegistry = {
  record: recordBusinessTransition,
  recordConditional: recordConditionalTransition,
  snapshot: (at: Date = new Date()): BusinessTransitionMetricsSnapshot => {
    const endedAt = Number.isFinite(at.getTime()) ? at.toISOString() : new Date().toISOString();
    return buildSnapshot(state, endedAt);
  },
  consumeSnapshot: (at: Date = new Date()): BusinessTransitionMetricsSnapshot => {
    const endedAt = Number.isFinite(at.getTime()) ? at.toISOString() : new Date().toISOString();
    const snapshot = buildSnapshot(state, endedAt);
    state.interval = { ...emptyCounters(), startedAt: endedAt };
    return snapshot;
  },
  reset: (at: Date = new Date()): void => {
    state = initialState(at);
  },
};
