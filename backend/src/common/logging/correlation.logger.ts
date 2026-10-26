import { ConsoleLogger } from '@nestjs/common';
import { getCorrelationId } from '../utils/correlation-id.util';
import { redactLogValue, safeLogText } from '../utils/redact-log.util';

export const formatLogMessage = (
  message: unknown,
  correlationId = getCorrelationId(),
): string => {
  const redacted = redactLogValue(message);
  const text = typeof redacted === 'string' ? redacted : safeLogText(redacted);
  return correlationId ? `[cid=${correlationId}] ${text}` : text;
};

/** Global Nest logger that adds the active request/job correlation ID and
 * redacts common secret/PII shapes from both messages and optional params. */
export class CorrelationLogger extends ConsoleLogger {
  override log(message: any, ...optionalParams: any[]): void {
    super.log(formatLogMessage(message), ...optionalParams.map(redactLogValue));
  }

  override error(message: any, ...optionalParams: any[]): void {
    super.error(formatLogMessage(message), ...optionalParams.map(redactLogValue));
  }

  override warn(message: any, ...optionalParams: any[]): void {
    super.warn(formatLogMessage(message), ...optionalParams.map(redactLogValue));
  }

  override debug(message: any, ...optionalParams: any[]): void {
    super.debug(formatLogMessage(message), ...optionalParams.map(redactLogValue));
  }

  override verbose(message: any, ...optionalParams: any[]): void {
    super.verbose(formatLogMessage(message), ...optionalParams.map(redactLogValue));
  }

  override fatal(message: any, ...optionalParams: any[]): void {
    super.fatal(formatLogMessage(message), ...optionalParams.map(redactLogValue));
  }
}
