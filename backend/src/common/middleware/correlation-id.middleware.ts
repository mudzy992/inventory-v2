import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  CORRELATION_ID_ALIAS_HEADER,
  CORRELATION_ID_HEADER,
  CORRELATION_ID_RESPONSE_HEADER,
  normalizeCorrelationId,
  runWithCorrelationId,
} from '../utils/correlation-id.util';
import { redactSensitiveText } from '../utils/redact-log.util';
import {
  normalizeRequestRoute,
  recordHttpRequest,
  type HttpRequestRecordEvent,
} from '../http/http-request-metrics.registry';
import { writeStructuredLog } from '../logging/structured-log.util';

type RequestLogger = (line: string) => void;
export type RequestMetricsRecorder = (event: HttpRequestRecordEvent) => void;

const defaultRequestLogger: RequestLogger = (line) => new Logger('HTTP').log(line);

const requestPath = (req: Request): string => {
  const raw = req.originalUrl ?? req.url ?? '/';
  return redactSensitiveText(raw.split('?')[0] ?? '/');
};

export const createCorrelationIdMiddleware = (
  log: RequestLogger = defaultRequestLogger,
  record: RequestMetricsRecorder = recordHttpRequest,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers[CORRELATION_ID_HEADER] ?? req.headers[CORRELATION_ID_ALIAS_HEADER];
    const raw = Array.isArray(header) ? header[0] : header;
    const correlationId = normalizeCorrelationId(raw) ?? randomUUID();
    const startedAt = Date.now();
    res.setHeader(CORRELATION_ID_RESPONSE_HEADER, correlationId);
    res.on('finish', () => {
      const path = requestPath(req);
      const durationMs = Math.max(0, Date.now() - startedAt);
      const status = res.statusCode;
      // Metrics must never prevent the per-request log line from being emitted.
      try {
        record({ method: req.method, path, status, durationMs });
      } catch (error) {
        writeStructuredLog('error', {
          event: 'http_request_metrics_record_failed',
          correlationId,
          error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
        });
      }
      const line = JSON.stringify({
        event: 'http_request',
        correlationId,
        method: req.method,
        path,
        route: normalizeRequestRoute(req.originalUrl ?? req.url ?? '/'),
        status,
        durationMs,
      });
      runWithCorrelationId(correlationId, () => log(line));
    });
    runWithCorrelationId(correlationId, () => next());
  };
};

export const correlationIdMiddleware = createCorrelationIdMiddleware();
