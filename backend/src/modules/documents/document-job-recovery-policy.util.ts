/**
 * Bounded recovery policy for DocumentJob rows.
 *
 * `DocumentConversionEventsService.reconcileStaleJobs()` used to leave a
 * `queued`/`running` row alone whenever its BullMQ job was still
 * `waiting`/`active`/`delayed`. That is correct for a healthy in-flight
 * conversion, but if the document-worker is SIGKILLed and never returns (or
 * no worker is running at all), BullMQ never emits a terminal event and the
 * DB row stays `running` FOREVER — exactly the "no job left without an owner"
 * exit criterion from the audit. This module adds a time bound so a stuck job
 * becomes a terminal `failed` row with one durable notification, while
 * normal in-flight work is untouched.
 */

export const DEFAULT_DOCUMENT_JOB_STALE_MS = 30 * 60 * 1000; // 30 min
export const MIN_DOCUMENT_JOB_STALE_MS = 5 * 60 * 1000; // 5 min
export const MAX_DOCUMENT_JOB_STALE_MS = 24 * 60 * 60 * 1000; // 24 h
export const DOCUMENT_JOB_STALE_RECOVERY_ERROR =
  'Generisanje dokumenta je isteklo bez rezultata. Pokušajte ponovo.';

export interface StaleDocumentJob {
  /** `findActiveJobs()` returns the full Prisma enum although it filters to active rows. */
  status: string;
  createdAt: Date;
  startedAt: Date | null;
}

export type StaleRecoveryDecision = 'none' | 'missing' | 'stuck';

/** Strict, fail-closed parsing of DOCUMENT_JOB_STALE_TIMEOUT_MS. */
export const resolveDocumentJobStaleMs = (raw: string | undefined): number => {
  if (raw === undefined || raw.trim() === '') return DEFAULT_DOCUMENT_JOB_STALE_MS;
  const normalized = raw.trim();
  if (!/^\d+$/u.test(normalized)) {
    throw new Error(
      `DOCUMENT_JOB_STALE_TIMEOUT_MS must be an integer between ` +
        `${MIN_DOCUMENT_JOB_STALE_MS} and ${MAX_DOCUMENT_JOB_STALE_MS}`,
    );
  }
  const parsed = Number(normalized);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < MIN_DOCUMENT_JOB_STALE_MS ||
    parsed > MAX_DOCUMENT_JOB_STALE_MS
  ) {
    throw new Error(
      `DOCUMENT_JOB_STALE_TIMEOUT_MS must be an integer between ` +
        `${MIN_DOCUMENT_JOB_STALE_MS} and ${MAX_DOCUMENT_JOB_STALE_MS}`,
    );
  }
  return parsed;
};

/** Age starts at `startedAt` for a claimed job, otherwise at creation. */
export const documentJobAgeMs = (job: StaleDocumentJob, now: number): number => {
  const anchor = job.status === 'running' && job.startedAt ? job.startedAt : job.createdAt;
  return now - anchor.getTime();
};

export interface StaleRecoveryInput {
  job: StaleDocumentJob;
  bullJobPresent: boolean;
  bullJobState: string;
  now: number;
  staleMs: number;
  missingGraceMs: number;
}

export const decideStaleRecovery = ({
  job,
  bullJobPresent,
  bullJobState,
  now,
  staleMs,
  missingGraceMs,
}: StaleRecoveryInput): StaleRecoveryDecision => {
  const age = documentJobAgeMs(job, now);
  if (!bullJobPresent) {
    return age >= missingGraceMs ? 'missing' : 'none';
  }
  // Terminal BullMQ states are handled by the existing completed/failed paths.
  if (bullJobState === 'completed' || bullJobState === 'failed') return 'none';
  // waiting / active / delayed / prioritized / paused / unknown: a healthy
  // job is left alone; one older than the bound has lost its owner.
  return age >= staleMs ? 'stuck' : 'none';
};

/**
 * Deployment guard: stale recovery must never fire before the worker's own
 * conversion timeout + BullMQ lockDuration slack, otherwise a legitimate
 * long conversion would be declared failed while still running.
 */
export const assertStaleTimeoutAfterWorkerTimeout = (
  staleMs: number,
  convertTimeoutMs: number,
  lockSlackMs = 30_000,
): void => {
  if (staleMs <= convertTimeoutMs + lockSlackMs) {
    throw new Error(
      `DOCUMENT_JOB_STALE_TIMEOUT_MS (${staleMs}) must exceed ` +
        `DOCUMENT_WORKER_CONVERT_TIMEOUT_MS (${convertTimeoutMs}) + ${lockSlackMs}ms lock slack`,
    );
  }
};
