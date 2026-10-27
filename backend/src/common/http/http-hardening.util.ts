import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  classifyRateLimitFailure,
  recordRateLimitDecision,
  sanitizeRateLimitError,
  type RateLimitOutcome,
} from '../../redis/rate-limit-metrics.registry';
import { writeStructuredLog } from '../logging/structured-log.util';

/**
 * Dependency-free HTTP hardening layer (the audit's "Helmet / global rate
 * limit" decision, implemented as an explicit, reversible policy).
 *
 * Security headers are ON by default but use only a safe subset: no
 * Content-Security-Policy is emitted because the app serves a generated
 * `text/html` transfer document with inline styling — CSP remains an owner
 * decision. HSTS is emitted only for requests that actually arrived over
 * HTTPS, so local/plain-HTTP dev never gets an unremovable browser pin.
 *
 * The global rate limit is OFF by default (owner decision) and, when enabled,
 * uses the same atomic Lua counter and process metrics as the per-route
 * guards. Health endpoints are always exempt. No client IP is ever logged or
 * used as a raw Redis key.
 */

export const GLOBAL_RATE_LIMIT_POLICY_NAME = 'global_http';
export const GLOBAL_RATE_LIMIT_KEY_PREFIX = 'ratelimit:global:';

/** Intentionally excludes CSP (owner decision) and CORP (cross-origin API). */
export const SECURITY_HEADERS_CATALOG = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'X-DNS-Prefetch-Control': 'off',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=()',
} as const;

export const HSTS_HEADER = 'Strict-Transport-Security';
export const DEFAULT_HSTS_MAX_AGE_SECONDS = 15_552_000; // 180 days
export const MAX_HSTS_MAX_AGE_SECONDS = 31_536_000; // 1 year

export interface SecurityHeadersPolicy {
  enabled: boolean;
  hstsMaxAgeSeconds: number;
}

export interface GlobalRateLimitPolicy {
  enabled: boolean;
  max: number;
  windowSeconds: number;
  failClosed: boolean;
}

const readBoolean = (raw: string | undefined, fallback: boolean, name: string): boolean => {
  if (raw === undefined || raw.trim() === '') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`${name} must be either "true" or "false"`);
};

const readBoundedInt = (
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number => {
  if (raw === undefined || raw.trim() === '') return fallback;
  const normalized = raw.trim();
  if (!/^\d+$/u.test(normalized)) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
};

export const resolveSecurityHeadersPolicy = (
  env: NodeJS.ProcessEnv = process.env,
): SecurityHeadersPolicy => ({
  enabled: readBoolean(env.SECURITY_HEADERS_ENABLED, true, 'SECURITY_HEADERS_ENABLED'),
  hstsMaxAgeSeconds: readBoundedInt(
    env.HSTS_MAX_AGE_SECONDS,
    DEFAULT_HSTS_MAX_AGE_SECONDS,
    0,
    MAX_HSTS_MAX_AGE_SECONDS,
    'HSTS_MAX_AGE_SECONDS',
  ),
});

export const resolveGlobalRateLimitPolicy = (
  env: NodeJS.ProcessEnv = process.env,
): GlobalRateLimitPolicy => ({
  // Owner decision: opt-in. Existing per-route guards remain authoritative.
  enabled: readBoolean(env.GLOBAL_RATE_LIMIT_ENABLED, false, 'GLOBAL_RATE_LIMIT_ENABLED'),
  max: readBoundedInt(env.GLOBAL_RATE_LIMIT_MAX, 300, 1, 100_000, 'GLOBAL_RATE_LIMIT_MAX'),
  windowSeconds: readBoundedInt(
    env.GLOBAL_RATE_LIMIT_WINDOW_SEC,
    60,
    1,
    3600,
    'GLOBAL_RATE_LIMIT_WINDOW_SEC',
  ),
  failClosed: readBoolean(
    env.GLOBAL_RATE_LIMIT_FAIL_CLOSED,
    false,
    'GLOBAL_RATE_LIMIT_FAIL_CLOSED',
  ),
});

const firstHeaderValue = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};

export const isSecureRequest = (req: IncomingMessage): boolean => {
  const forwarded = firstHeaderValue(req.headers['x-forwarded-proto'])
    .split(',')[0]
    ?.trim()
    .toLowerCase();
  if (forwarded === 'https') return true;
  return (req.socket as { encrypted?: boolean } | undefined)?.encrypted === true;
};

const pathnameOf = (url: string | undefined): string => (url ?? '').split('?')[0] ?? '';

/** Liveness/readiness must never be rate limited (Coolify healthcheck). */
export const isGlobalRateLimitExempt = (url: string | undefined): boolean =>
  /(^|\/)health(\/|$)/u.test(pathnameOf(url));

/** Auth/setup responses must not be cached by shared proxies or browsers. */
export const isNoStorePath = (url: string | undefined): boolean =>
  /\/(auth|setup)(\/|$)/u.test(pathnameOf(url));

export const buildGlobalRateLimitKey = (req: IncomingMessage): string => {
  const clientIp =
    (req as IncomingMessage & { ip?: string }).ip ??
    (req.socket as { remoteAddress?: string } | undefined)?.remoteAddress ??
    'unknown';
  const digest = createHash('sha256').update(clientIp).digest('hex').slice(0, 32);
  return `${GLOBAL_RATE_LIMIT_KEY_PREFIX}${digest}`;
};

export const applySecurityHeaders = (
  req: IncomingMessage,
  res: ServerResponse,
  policy: SecurityHeadersPolicy,
): void => {
  if (!policy.enabled) return;
  for (const [name, value] of Object.entries(SECURITY_HEADERS_CATALOG)) {
    res.setHeader(name, value);
  }
  // Express adds this before our middleware runs; remove it here as well as
  // disabling it on the app instance (defence in depth).
  res.removeHeader('X-Powered-By');
  if (policy.hstsMaxAgeSeconds > 0 && isSecureRequest(req)) {
    res.setHeader(HSTS_HEADER, `max-age=${policy.hstsMaxAgeSeconds}`);
  }
  if (isNoStorePath(req.url)) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
  }
};

const sendJson = (res: ServerResponse, statusCode: number, payload: object): void => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

export type NextFunction = () => void;
export type RateLimitCounter = (key: string, windowSeconds: number) => Promise<number>;

export const securityHeadersMiddleware =
  (policy: SecurityHeadersPolicy) =>
  (req: IncomingMessage, res: ServerResponse, next: NextFunction): void => {
    applySecurityHeaders(req, res, policy);
    next();
  };

export const globalRateLimitMiddleware =
  (policy: GlobalRateLimitPolicy, counter: RateLimitCounter) =>
  async (req: IncomingMessage, res: ServerResponse, next: NextFunction): Promise<void> => {
    if (!policy.enabled || isGlobalRateLimitExempt(req.url)) {
      next();
      return;
    }
    const key = buildGlobalRateLimitKey(req);
    try {
      const count = await counter(key, policy.windowSeconds);
      res.setHeader('RateLimit-Limit', policy.max);
      res.setHeader('RateLimit-Remaining', Math.max(0, policy.max - count));
      if (count > policy.max) {
        recordRateLimitDecision({
          policy: GLOBAL_RATE_LIMIT_POLICY_NAME,
          outcome: 'exceeded',
        });
        res.setHeader('Retry-After', policy.windowSeconds);
        sendJson(res, 429, {
          statusCode: 429,
          message: 'Previše zahtjeva. Pokušajte ponovo kasnije.',
        });
        return;
      }
      recordRateLimitDecision({ policy: GLOBAL_RATE_LIMIT_POLICY_NAME, outcome: 'allowed' });
      next();
    } catch (error) {
      const outcome: RateLimitOutcome = policy.failClosed ? 'fail_closed' : 'fail_open';
      recordRateLimitDecision({ policy: GLOBAL_RATE_LIMIT_POLICY_NAME, outcome, error });
      writeStructuredLog('error', {
        event: 'global_rate_limit_check_failed',
        outcome,
        reason: classifyRateLimitFailure(error),
        error: sanitizeRateLimitError(error),
      });
      if (policy.failClosed) {
        sendJson(res, 503, {
          statusCode: 503,
          message: 'Servis trenutno nije dostupan. Pokušajte ponovo kasnije.',
        });
        return;
      }
      next();
    }
  };
