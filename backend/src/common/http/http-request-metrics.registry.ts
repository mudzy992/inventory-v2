import { redactSensitiveText } from '../utils/redact-log.util';

/**
 * Process-local HTTP request metrics. Counters are intentionally bounded:
 * paths are normalised to low-cardinality routes, the number of distinct route
 * keys is capped, and latencies are stored in fixed histogram buckets. The
 * registry never stores bodies, headers, query strings, user IDs or raw routes.
 */

export const HTTP_REQUEST_METRICS_MAX_ROUTES = 128;
export const HTTP_REQUEST_METRICS_MAX_SEGMENTS = 12;
export const HTTP_REQUEST_METRICS_MAX_DURATION_MS = 3_600_000;
export const HTTP_REQUEST_OVERFLOW_ROUTE = '/:other';

export const HTTP_LATENCY_BUCKETS: ReadonlyArray<{
  label: string;
  upperBoundMs: number | null;
}> = [
  { label: 'le_25', upperBoundMs: 25 },
  { label: 'le_50', upperBoundMs: 50 },
  { label: 'le_100', upperBoundMs: 100 },
  { label: 'le_250', upperBoundMs: 250 },
  { label: 'le_500', upperBoundMs: 500 },
  { label: 'le_1000', upperBoundMs: 1000 },
  { label: 'le_2500', upperBoundMs: 2500 },
  { label: 'le_5000', upperBoundMs: 5000 },
  { label: 'over_5000', upperBoundMs: null },
];

export type HttpStatusClass = '2xx' | '3xx' | '4xx' | '5xx' | 'other';

const STATUS_CLASSES: readonly HttpStatusClass[] = ['2xx', '3xx', '4xx', '5xx', 'other'];
const NUMERIC_SEGMENT = /^\d+$/u;
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const HEX_SEGMENT = /^[0-9a-f]{16,}$/iu;
const OPAQUE_SEGMENT = /^[a-z0-9_-]{20,}$/iu;
const FILE_SEGMENT = /\.(?:pdf|docx?|xlsx?|csv|zip|png|jpe?g|html?)$/iu;
const STATIC_SEGMENT = /^[a-z0-9][a-z0-9._-]{0,47}$/iu;
const SAFE_METHOD = /^[A-Z]{1,10}$/u;

/** Turn a raw URL into a bounded, privacy-safe route label. Query strings,
 * IDs, tokens, file names and unexpected characters never reach the log. */
export const normalizeRequestRoute = (rawUrl: string): string => {
  const pathname = redactSensitiveText(String(rawUrl ?? '/').split('?')[0] ?? '/')
    .split('#')[0] ?? '/';
  const segments = pathname
    .split('/')
    .filter((segment) => segment.length > 0)
    .slice(0, HTTP_REQUEST_METRICS_MAX_SEGMENTS)
    .map((segment) => {
      const candidate = segment.toLowerCase();
      if (
        NUMERIC_SEGMENT.test(candidate) ||
        UUID_SEGMENT.test(candidate) ||
        HEX_SEGMENT.test(candidate) ||
        OPAQUE_SEGMENT.test(candidate) ||
        FILE_SEGMENT.test(candidate) ||
        candidate.includes('[redacted')
      ) {
        return ':id';
      }
      return STATIC_SEGMENT.test(candidate) ? candidate : ':value';
    });
  return segments.length > 0 ? `/${segments.join('/')}` : '/';
};

/** Readiness/liveness probes are polled by the orchestrator; their synthetic
 * 503/200 traffic would otherwise dominate error-rate calculations. */
export const isHealthProbeRoute = (route: string): boolean =>
  /(?:^|\/)health(?:\/(?:live|ready))?$/u.test(route);

export const classifyHttpStatus = (status: number): HttpStatusClass => {
  if (status >= 500 && status <= 599) return '5xx';
  if (status >= 400 && status <= 499) return '4xx';
  if (status >= 300 && status <= 399) return '3xx';
  if (status >= 200 && status <= 299) return '2xx';
  return 'other';
};

export interface HttpRequestRecordEvent {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  at?: Date;
}

export interface HttpRouteMetrics {
  route: string;
  requests: number;
  serverErrors: number;
  maxDurationMs: number;
}

export interface HttpRequestMetricsSnapshot {
  observedAt: string;
  startedAt: string;
  intervalStartedAt: string;
  intervalEndedAt: string;
  totalRequests: number;
  intervalRequests: number;
  byStatusClass: Record<HttpStatusClass, number>;
  byMethod: Record<string, number>;
  interval4xx: number;
  interval5xx: number;
  total4xx: number;
  total5xx: number;
  serverErrorRatePercent: number;
  clientErrorRatePercent: number;
  avgDurationMs: number;
  maxDurationMs: number;
  p95DurationMs: number | null;
  latencyBuckets: Record<string, number>;
  overflowRequests: number;
  topRoutes: HttpRouteMetrics[];
  topServerErrorRoutes: HttpRouteMetrics[];
  lastRequestAt: string | null;
  lastStatus: number | null;
}

interface RouteCounters {
  requests: number;
  serverErrors: number;
  maxDurationMs: number;
}

interface Counters {
  total: number;
  byStatusClass: Record<HttpStatusClass, number>;
  byMethod: Record<string, number>;
  byRoute: Record<string, RouteCounters>;
  overflowRequests: number;
  sumDurationMs: number;
  maxDurationMs: number;
  latencyBuckets: Record<string, number>;
}

interface IntervalCounters extends Counters {
  startedAt: string;
}

interface RegistryState {
  startedAt: string;
  total: Counters;
  interval: IntervalCounters;
  lastRequestAt: string | null;
  lastStatus: number | null;
}

const emptyCounters = (): Counters => ({
  total: 0,
  byStatusClass: Object.fromEntries(STATUS_CLASSES.map((name) => [name, 0])) as Record<
    HttpStatusClass,
    number
  >,
  byMethod: {},
  byRoute: {},
  overflowRequests: 0,
  sumDurationMs: 0,
  maxDurationMs: 0,
  latencyBuckets: Object.fromEntries(
    HTTP_LATENCY_BUCKETS.map(({ label }) => [label, 0]),
  ) as Record<string, number>,
});

const initialState = (at: Date = new Date()): RegistryState => {
  const timestamp = at.toISOString();
  return {
    startedAt: timestamp,
    total: emptyCounters(),
    interval: { ...emptyCounters(), startedAt: timestamp },
    lastRequestAt: null,
    lastStatus: null,
  };
};

const safeTimestamp = (at: Date | undefined): string => {
  if (at && Number.isFinite(at.getTime())) return at.toISOString();
  return new Date().toISOString();
};

const sanitizeDuration = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.round(value), HTTP_REQUEST_METRICS_MAX_DURATION_MS));
};

const sanitizeStatus = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.round(value), 999));
};

const sanitizeMethod = (value: string): string => {
  const method = String(value ?? '').toUpperCase();
  return SAFE_METHOD.test(method) ? method : 'OTHER';
};

const latencyBucketLabel = (durationMs: number): string => {
  for (const { label, upperBoundMs } of HTTP_LATENCY_BUCKETS) {
    if (upperBoundMs !== null && durationMs <= upperBoundMs) return label;
  }
  return HTTP_LATENCY_BUCKETS[HTTP_LATENCY_BUCKETS.length - 1].label;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const increment = (counters: Counters, route: string, event: HttpRequestRecordEvent): void => {
  const status = sanitizeStatus(event.status);
  const durationMs = sanitizeDuration(event.durationMs);
  const statusClass = classifyHttpStatus(status);
  const method = sanitizeMethod(event.method);

  counters.total += 1;
  counters.byStatusClass[statusClass] += 1;
  counters.byMethod[method] = (counters.byMethod[method] ?? 0) + 1;
  counters.sumDurationMs += durationMs;
  counters.maxDurationMs = Math.max(counters.maxDurationMs, durationMs);
  const bucket = latencyBucketLabel(durationMs);
  counters.latencyBuckets[bucket] = (counters.latencyBuckets[bucket] ?? 0) + 1;

  let routeKey = route;
  if (!counters.byRoute[routeKey]) {
    if (Object.keys(counters.byRoute).length >= HTTP_REQUEST_METRICS_MAX_ROUTES) {
      routeKey = HTTP_REQUEST_OVERFLOW_ROUTE;
      counters.overflowRequests += 1;
    }
  }
  const routeCounters = counters.byRoute[routeKey] ?? {
    requests: 0,
    serverErrors: 0,
    maxDurationMs: 0,
  };
  counters.byRoute[routeKey] = routeCounters;
  routeCounters.requests += 1;
  if (statusClass === '5xx') routeCounters.serverErrors += 1;
  routeCounters.maxDurationMs = Math.max(routeCounters.maxDurationMs, durationMs);
};

const computeP95 = (counters: Counters): number | null => {
  if (counters.total === 0) return null;
  const target = Math.ceil(counters.total * 0.95);
  let cumulative = 0;
  for (const { label, upperBoundMs } of HTTP_LATENCY_BUCKETS) {
    cumulative += counters.latencyBuckets[label] ?? 0;
    if (cumulative >= target) {
      return upperBoundMs ?? counters.maxDurationMs;
    }
  }
  return counters.maxDurationMs;
};

const sortedRoutes = (
  byRoute: Record<string, RouteCounters>,
  compare: (a: HttpRouteMetrics, b: HttpRouteMetrics) => number,
  filter: (entry: HttpRouteMetrics) => boolean,
): HttpRouteMetrics[] =>
  Object.entries(byRoute)
    .map(([route, counters]) => ({ route, ...counters }))
    .filter(filter)
    .sort(compare)
    .slice(0, 5);

const byRequests = (a: HttpRouteMetrics, b: HttpRouteMetrics): number =>
  b.requests - a.requests || a.route.localeCompare(b.route);

const byServerErrors = (a: HttpRouteMetrics, b: HttpRouteMetrics): number =>
  b.serverErrors - a.serverErrors || b.requests - a.requests || a.route.localeCompare(b.route);

const buildSnapshot = (stateAtReport: RegistryState, endedAt: string): HttpRequestMetricsSnapshot => {
  const total = stateAtReport.total;
  const interval = stateAtReport.interval;
  const rate = (count: number): number =>
    interval.total === 0 ? 0 : round2((count / interval.total) * 100);

  return {
    observedAt: endedAt,
    startedAt: stateAtReport.startedAt,
    intervalStartedAt: interval.startedAt,
    intervalEndedAt: endedAt,
    totalRequests: total.total,
    intervalRequests: interval.total,
    byStatusClass: { ...interval.byStatusClass },
    byMethod: { ...interval.byMethod },
    interval4xx: interval.byStatusClass['4xx'],
    interval5xx: interval.byStatusClass['5xx'],
    total4xx: total.byStatusClass['4xx'],
    total5xx: total.byStatusClass['5xx'],
    serverErrorRatePercent: rate(interval.byStatusClass['5xx']),
    clientErrorRatePercent: rate(interval.byStatusClass['4xx']),
    avgDurationMs: interval.total === 0 ? 0 : round2(interval.sumDurationMs / interval.total),
    maxDurationMs: interval.maxDurationMs,
    p95DurationMs: computeP95(interval),
    latencyBuckets: { ...interval.latencyBuckets },
    overflowRequests: interval.overflowRequests,
    topRoutes: sortedRoutes(interval.byRoute, byRequests, () => true),
    topServerErrorRoutes: sortedRoutes(
      interval.byRoute,
      byServerErrors,
      (entry) => entry.serverErrors > 0,
    ),
    lastRequestAt: stateAtReport.lastRequestAt,
    lastStatus: stateAtReport.lastStatus,
  };
};

let state = initialState();

export const recordHttpRequest = (
  event: HttpRequestRecordEvent,
  options: { skipHealthProbes?: boolean } = {},
): void => {
  const route = normalizeRequestRoute(event.path);
  if ((options.skipHealthProbes ?? true) && isHealthProbeRoute(route)) return;

  const status = sanitizeStatus(event.status);
  const timestamp = safeTimestamp(event.at);
  increment(state.total, route, event);
  increment(state.interval, route, event);
  state.lastRequestAt = timestamp;
  state.lastStatus = status;
};

/** Periodic reporter drains only the interval counters; lifetime totals stay
 * available so a later report still shows process-wide traffic volume. */
export const httpRequestMetricsRegistry = {
  record: recordHttpRequest,
  snapshot: (at: Date = new Date()): HttpRequestMetricsSnapshot => {
    const endedAt = Number.isFinite(at.getTime()) ? at.toISOString() : new Date().toISOString();
    return buildSnapshot(state, endedAt);
  },
  consumeSnapshot: (at: Date = new Date()): HttpRequestMetricsSnapshot => {
    const endedAt = Number.isFinite(at.getTime()) ? at.toISOString() : new Date().toISOString();
    const snapshot = buildSnapshot(state, endedAt);
    state.interval = { ...emptyCounters(), startedAt: endedAt };
    return snapshot;
  },
  reset: (at: Date = new Date()): void => {
    state = initialState(at);
  },
};
