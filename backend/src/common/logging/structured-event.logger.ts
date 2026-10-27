import type {
  StructuredLogLevel,
  StructuredLogPayload,
} from './structured-log.util';
import { formatStructuredLogLine } from './structured-log.util';

/** Minimal Nest `Logger` surface so services can be tested with a capture
 * object instead of writing to stdout/stderr. */
export interface NestLoggerLike {
  log: (line: string) => void;
  warn: (line: string) => void;
  error: (line: string) => void;
  debug?: (line: string) => void;
}

/** Bounded error detail. `formatStructuredLogLine` redacts the final JSON, so
 * secrets, tokens, e-mails and container paths are removed before emission. */
export const safeErrorText = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  return raw.slice(0, 500);
};

/**
 * Emit one line of JSON through the application logger. `CorrelationLogger`
 * keeps JSON records parseable and attaches the authoritative
 * `correlationId`/`level` fields; free-form messages must not be used for
 * operational error/warn paths.
 */
export const logStructuredEvent = (
  logger: NestLoggerLike,
  level: StructuredLogLevel,
  payload: StructuredLogPayload,
): string => {
  const line = formatStructuredLogLine(level, payload);
  if (level === 'error') {
    logger.error(line);
  } else if (level === 'warn') {
    logger.warn(line);
  } else if (level === 'debug') {
    if (logger.debug) logger.debug(line);
    else logger.log(line);
  } else {
    logger.log(line);
  }
  return line;
};
