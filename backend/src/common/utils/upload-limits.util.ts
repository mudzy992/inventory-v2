const BYTES_PER_MEGABYTE = 1024 * 1024;
const DEFAULT_MAX_UPLOAD_MB = 10;

const toPositiveSafeByteCount = (megabytes: number): number | undefined => {
  if (!Number.isFinite(megabytes) || megabytes <= 0) {
    return undefined;
  }
  const bytes = Math.floor(megabytes * BYTES_PER_MEGABYTE);
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : undefined;
};

/** Resolve the effective Multer limit from the admin setting and env fallback. */
export const resolveMaxUploadBytes = (
  configuredMaxMb: number,
  fallbackMaxMb: number,
): number =>
  toPositiveSafeByteCount(configuredMaxMb) ??
  toPositiveSafeByteCount(fallbackMaxMb) ??
  DEFAULT_MAX_UPLOAD_MB * BYTES_PER_MEGABYTE;
