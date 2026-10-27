const SENSITIVE_JSON_VALUE =
  /("(?:authorization|cookie|password|passwordHash|refreshToken|accessToken|token|secret|jwt|apiKey)"\s*:\s*)"[^"]*"/giu;
// The leading boundary includes quotes/brackets because `redactSensitiveText`
// also runs over already-serialised JSON: an error message such as
// `"error":"password=hunter2 ..."` must be redacted inside that string too.
const PLAIN_SECRET_ASSIGNMENT =
  /(^|[\s,;"'[{])(password|passwordHash|refreshToken|accessToken|token|secret|jwt|apiKey)=([^\s,;}"']+)/giu;
const BEARER_TOKEN = /(Bearer\s+)[A-Za-z0-9._~+/=-]+/giu;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const SECRET_QUERY = /([?&](?:token|password|refreshToken|accessToken|secret|apiKey)=)[^&\s]+/giu;
const ABSOLUTE_CONTAINER_PATH = /(?:\/(?:app|tmp|var|home)\/[^\s"',;]+)/gu;

/** Best-effort redaction for free-form application logs. Structured log
 * events intentionally avoid secrets/PII; this is the safety net for error
 * objects and third-party messages. */
export const redactSensitiveText = (value: string): string =>
  value
    .replace(SENSITIVE_JSON_VALUE, '$1"[redacted]"')
    .replace(PLAIN_SECRET_ASSIGNMENT, '$1$2=[redacted]')
    .replace(BEARER_TOKEN, '$1[redacted]')
    .replace(JWT, '[redacted-jwt]')
    .replace(SECRET_QUERY, '$1[redacted]')
    .replace(EMAIL, '[redacted-email]')
    .replace(ABSOLUTE_CONTAINER_PATH, '[redacted-path]');

export const redactLogValue = (value: unknown): unknown => {
  if (typeof value === 'string') return redactSensitiveText(value);
  if (value instanceof Error) return redactSensitiveText(value.stack ?? value.message);
  if (typeof value === 'object' && value !== null) {
    try {
      const redacted = redactSensitiveText(JSON.stringify(value));
      return JSON.parse(redacted) as unknown;
    } catch {
      return '[unserializable]';
    }
  }
  return value;
};

export const safeLogText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack ?? value.message;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return '[unserializable]';
  }
};
