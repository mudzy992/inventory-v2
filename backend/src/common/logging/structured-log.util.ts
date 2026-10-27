import { redactSensitiveText } from '../utils/redact-log.util';

export type StructuredLogLevel = 'log' | 'warn' | 'error' | 'debug';

export interface StructuredLogPayload {
  event: string;
  [key: string]: unknown;
}

/** Single-line JSON event for infrastructure code that can run before Nest
 * installs its global CorrelationLogger. Free-form log callers should migrate
 * to this helper so collectors always receive parseable, redacted records. */
export const formatStructuredLogLine = (
  level: StructuredLogLevel,
  payload: StructuredLogPayload,
): string => {
  try {
    // `level` is written last so a payload cannot spoof the logger severity.
    return redactSensitiveText(JSON.stringify({ ...payload, level }));
  } catch {
    return JSON.stringify({ event: 'structured_log_serialization_error', level: 'error' });
  }
};

export const writeStructuredLog = (
  level: StructuredLogLevel,
  payload: StructuredLogPayload,
): string => {
  const line = formatStructuredLogLine(level, payload);
  const stream = level === 'log' || level === 'debug' ? process.stdout : process.stderr;
  stream.write(`${line}\n`);
  return line;
};
