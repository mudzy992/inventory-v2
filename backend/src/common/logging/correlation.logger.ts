import { ConsoleLogger } from '@nestjs/common';
import { getCorrelationId } from '../utils/correlation-id.util';
import { redactLogValue, safeLogText } from '../utils/redact-log.util';

export type StructuredLogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

/** Preserve already-structured JSON log lines and enrich them with the active
 * correlation ID and log level. Free-form messages keep the readable
 * `[cid=...]` prefix while legacy callers are migrated to JSON events. */
export const formatLogMessage = (
  message: unknown,
  correlationId = getCorrelationId(),
  level?: StructuredLogLevel,
): string => {
  const redacted = redactLogValue(message);
  const text = typeof redacted === 'string' ? redacted : safeLogText(redacted);
  if (correlationId || level) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return JSON.stringify({
          ...parsed,
          ...(correlationId ? { correlationId } : {}),
          ...(level ? { level } : {}),
        });
      }
    } catch {
      // Free-form log line: fall through to the legacy prefixed format.
    }
  }
  return correlationId ? `[cid=${correlationId}] ${text}` : text;
};

/** Global Nest logger that adds the active request/job correlation ID and
 * redacts common secret/PII shapes from both messages and optional params. */
export class CorrelationLogger extends ConsoleLogger {
  override log(message: any, ...optionalParams: any[]): void {
    super.log(
      formatLogMessage(message, getCorrelationId(), 'log'),
      ...optionalParams.map(redactLogValue),
    );
  }

  override error(message: any, ...optionalParams: any[]): void {
    super.error(
      formatLogMessage(message, getCorrelationId(), 'error'),
      ...optionalParams.map(redactLogValue),
    );
  }

  override warn(message: any, ...optionalParams: any[]): void {
    super.warn(
      formatLogMessage(message, getCorrelationId(), 'warn'),
      ...optionalParams.map(redactLogValue),
    );
  }

  override debug(message: any, ...optionalParams: any[]): void {
    super.debug(
      formatLogMessage(message, getCorrelationId(), 'debug'),
      ...optionalParams.map(redactLogValue),
    );
  }

  override verbose(message: any, ...optionalParams: any[]): void {
    super.verbose(
      formatLogMessage(message, getCorrelationId(), 'verbose'),
      ...optionalParams.map(redactLogValue),
    );
  }

  override fatal(message: any, ...optionalParams: any[]): void {
    super.fatal(
      formatLogMessage(message, getCorrelationId(), 'fatal'),
      ...optionalParams.map(redactLogValue),
    );
  }
}
