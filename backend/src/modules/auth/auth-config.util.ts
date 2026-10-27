/** Shared JWT TTL validation (N-10). */
export const JWT_TTL_PATTERN = /^(\d+)([smhd])$/u;

export const assertJwtTtl = (value: string | undefined, name: string): string => {
  const raw = (value ?? '').trim();
  if (!JWT_TTL_PATTERN.test(raw)) {
    throw new Error(`${name} must look like 15m / 7d / 3600s (digits + s|m|h|d)`);
  }
  const amount = Number(JWT_TTL_PATTERN.exec(raw)![1]);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 365 * 24 * 3600) {
    throw new Error(`${name} is out of range`);
  }
  return raw;
};

export const JWT_TTL_MULTIPLIERS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};
