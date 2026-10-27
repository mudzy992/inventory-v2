import { redactSensitiveText } from '../common/utils/redact-log.util';

/**
 * Process-local rate-limit decision counters. Only low-cardinality labels are
 * kept: policy name, outcome and a bounded failure category. Client IPs,
 * Redis keys and raw error messages never enter the snapshot.
 */

export const RATE_LIMIT_METRICS_MAX_POLICIES = 16;
export const RATE_LIMIT_POLICY_OVERFLOW = 'other';

export type RateLimitOutcome = 'allowed' | 'exceeded' | 'fail_open' | 'fail_closed';
export type RateLimitFailureReason = 'timeout' | 'connection' | 'invalid_counter' | 'unknown';

const OUTCOMES: readonly RateLimitOutcome[] = [
  'allowed',
  'exceeded',
  'fail_open',
  'fail_closed',
];
const FAILURE_REASONS: readonly RateLimitFailureReason[] = [
  'timeout',
  'connection',
  'invalid_counter',
  'unknown',
];

export const normalizeRateLimitPolicy = (value: string): string => {
  const normalized = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/gu, '_')
    .slice(0, 32);
  return normalized.length > 0 ? normalized : RATE_LIMIT_POLICY_OVERFLOW;
};

/** Map an arbitrary Redis/client exception onto a small, safe label so a
 * collector never receives the raw (possibly key- or IP-bearing) message. */
export const classifyRateLimitFailure = (error: unknown): RateLimitFailureReason => {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  if (/timeout|timed ?out|etimedout/u.test(message)) return 'timeout';
  if (/invalid|counter|eval|script|wrong number of arguments/u.test(message)) {
    return 'invalid_counter';
  }
  if (
    /connect|econnrefused|enotfound|econnreset|closed|end|stream|broken pipe|offline|ready check/u.test(
      message,
    )
  ) {
    return 'connection';
  }
  return 'unknown';
};

/** Short, redacted error detail for the per-failure structured log line. */
export const sanitizeRateLimitError = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const safe = redactSensitiveText(raw)
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/gu, '[redacted-ip]')
    .replace(/ratelimit:[^\s"',;]+/giu, '[redacted-key]')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 200);
  return safe.length > 0 ? safe : 'unknown';
};

export interface RateLimitDecisionEvent {
  policy: string;
  outcome: RateLimitOutcome;
  error?: unknown;
  at?: Date;
}

export interface RateLimitMetricsSnapshot {
  observedAt: string;
  startedAt: string;
  intervalStartedAt: string;
  intervalEndedAt: string;
  totalDecisions: number;
  intervalDecisions: number;
  byOutcome: Record<RateLimitOutcome, number>;
  byPolicy: Record<string, number>;
  byFailureReason: Record<RateLimitFailureReason, number>;
  intervalAllowed: number;
  intervalExceeded: number;
  intervalFailOpen: number;
  intervalFailClosed: number;
  intervalFailures: number;
  totalFailures: number;
  consecutiveFailures: number;
  maxConsecutiveFailures: number;
  secondsSinceLastFailure: number | null;
  lastFailureAt: string | null;
  lastFailureReason: RateLimitFailureReason | null;
  lastFailurePolicy: string | null;
  overflowPolicies: number;
}

interface Counters {
  total: number;
  byOutcome: Record<RateLimitOutcome, number>;
  byPolicy: Record<string, number>;
  byFailureReason: Record<RateLimitFailureReason, number>;
  failures: number;
  overflowPolicies: number;
}

interface IntervalCounters extends Counters {
  startedAt: string;
}

interface RegistryState {
  startedAt: string;
  total: Counters;
  interval: IntervalCounters;
  consecutiveFailures: number;
  maxConsecutiveFailures: number;
  lastFailureAt: string | null;
  lastFailureReason: RateLimitFailureReason | null;
  lastFailurePolicy: string | null;
}

const emptyCounters = (): Counters => ({
  total: 0,
  byOutcome: Object.fromEntries(OUTCOMES.map((name) => [name, 0])) as Record<
    RateLimitOutcome,
    number
  >,
  byPolicy: {},
  byFailureReason: Object.fromEntries(FAILURE_REASONS.map((name) => [name, 0])) as Record<
    RateLimitFailureReason,
    number
  >,
  failures: 0,
  overflowPolicies: 0,
});

const initialState = (at: Date = new Date()): RegistryState => {
  const timestamp = at.toISOString();
  return {
    startedAt: timestamp,
    total: emptyCounters(),
    interval: { ...emptyCounters(), startedAt: timestamp },
    consecutiveFailures: 0,
    maxConsecutiveFailures: 0,
    lastFailureAt: null,
    lastFailureReason: null,
    lastFailurePolicy: null,
  };
};

const safeTimestamp = (at: Date | undefined): string =>
  at && Number.isFinite(at.getTime()) ? at.toISOString() : new Date().toISOString();

const increment = (counters: Counters, policy: string, event: RateLimitDecisionEvent): void => {
  counters.total += 1;
  counters.byOutcome[event.outcome] += 1;

  let policyKey = policy;
  if (!counters.byPolicy[policyKey]) {
    if (Object.keys(counters.byPolicy).length >= RATE_LIMIT_METRICS_MAX_POLICIES) {
      policyKey = RATE_LIMIT_POLICY_OVERFLOW;
      counters.overflowPolicies += 1;
    }
  }
  counters.byPolicy[policyKey] = (counters.byPolicy[policyKey] ?? 0) + 1;

  if (event.outcome === 'fail_open' || event.outcome === 'fail_closed') {
    counters.failures += 1;
    counters.byFailureReason[classifyRateLimitFailure(event.error)] += 1;
  }
};

let state = initialState();

export const recordRateLimitDecision = (event: RateLimitDecisionEvent): void => {
  const policy = normalizeRateLimitPolicy(event.policy);
  const timestamp = safeTimestamp(event.at);
  increment(state.total, policy, event);
  increment(state.interval, policy, event);

  if (event.outcome === 'fail_open' || event.outcome === 'fail_closed') {
    state.consecutiveFailures += 1;
    state.maxConsecutiveFailures = Math.max(state.maxConsecutiveFailures, state.consecutiveFailures);
    state.lastFailureAt = timestamp;
    state.lastFailureReason = classifyRateLimitFailure(event.error);
    state.lastFailurePolicy = policy;
  } else {
    // A single successful counter check proves Redis is serving this guard
    // again, so the sustained-outage streak must clear.
    state.consecutiveFailures = 0;
  }
};

const buildSnapshot = (stateAtReport: RegistryState, endedAt: string): RateLimitMetricsSnapshot => {
  const total = stateAtReport.total;
  const interval = stateAtReport.interval;
  const secondsSinceLastFailure = stateAtReport.lastFailureAt
    ? Math.max(
        0,
        Math.floor(
          (Date.parse(endedAt) - Date.parse(stateAtReport.lastFailureAt)) / 1_000,
        ),
      )
    : null;

  return {
    observedAt: endedAt,
    startedAt: stateAtReport.startedAt,
    intervalStartedAt: interval.startedAt,
    intervalEndedAt: endedAt,
    totalDecisions: total.total,
    intervalDecisions: interval.total,
    byOutcome: { ...interval.byOutcome },
    byPolicy: { ...interval.byPolicy },
    byFailureReason: { ...interval.byFailureReason },
    intervalAllowed: interval.byOutcome.allowed,
    intervalExceeded: interval.byOutcome.exceeded,
    intervalFailOpen: interval.byOutcome.fail_open,
    intervalFailClosed: interval.byOutcome.fail_closed,
    intervalFailures: interval.failures,
    totalFailures: total.failures,
    consecutiveFailures: stateAtReport.consecutiveFailures,
    maxConsecutiveFailures: stateAtReport.maxConsecutiveFailures,
    secondsSinceLastFailure,
    lastFailureAt: stateAtReport.lastFailureAt,
    lastFailureReason: stateAtReport.lastFailureReason,
    lastFailurePolicy: stateAtReport.lastFailurePolicy,
    overflowPolicies: interval.overflowPolicies,
  };
};

/** Periodic reporter drains only interval counters; lifetime totals and the
 * consecutive-failure streak stay visible across reports. */
export const rateLimitMetricsRegistry = {
  record: recordRateLimitDecision,
  snapshot: (at: Date = new Date()): RateLimitMetricsSnapshot => {
    const endedAt = Number.isFinite(at.getTime()) ? at.toISOString() : new Date().toISOString();
    return buildSnapshot(state, endedAt);
  },
  consumeSnapshot: (at: Date = new Date()): RateLimitMetricsSnapshot => {
    const endedAt = Number.isFinite(at.getTime()) ? at.toISOString() : new Date().toISOString();
    const snapshot = buildSnapshot(state, endedAt);
    state.interval = { ...emptyCounters(), startedAt: endedAt };
    return snapshot;
  },
  reset: (at: Date = new Date()): void => {
    state = initialState(at);
  },
};
