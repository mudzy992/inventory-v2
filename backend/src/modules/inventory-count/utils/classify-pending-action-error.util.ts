const RETRYABLE_ERROR_CODES = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
  'P2034',
  '40001',
  '40P01',
  '57P01',
  '57P02',
  '57P03',
  '08000',
  '08003',
  '08006',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
]);

const MAX_ERROR_CAUSE_DEPTH = 5;

export const isRetryablePendingActionError = (error: unknown): boolean => {
  const visited = new Set<object>();
  let current: unknown = error;

  for (let depth = 0; depth < MAX_ERROR_CAUSE_DEPTH && current; depth += 1) {
    if (typeof current !== 'object' || current === null || visited.has(current)) {
      return false;
    }
    visited.add(current);

    const candidate = current as {
      code?: unknown;
      cause?: unknown;
      meta?: { code?: unknown; cause?: unknown };
    };
    if (
      (typeof candidate.code === 'string' && RETRYABLE_ERROR_CODES.has(candidate.code)) ||
      (typeof candidate.meta?.code === 'string' && RETRYABLE_ERROR_CODES.has(candidate.meta.code))
    ) {
      return true;
    }
    current = candidate.cause ?? candidate.meta?.cause;
  }

  return false;
};

export const getPendingActionRetryDelayMs = (retryNumber: number): number => {
  if (!Number.isSafeInteger(retryNumber) || retryNumber < 1) {
    throw new RangeError('retryNumber must be a positive safe integer');
  }
  return Math.min(250 * 2 ** (retryNumber - 1), 2_000);
};
