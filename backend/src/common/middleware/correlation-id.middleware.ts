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

type RequestLogger = (line: string) => void;

const defaultRequestLogger: RequestLogger = (line) => new Logger('HTTP').log(line);

const requestPath = (req: Request): string => {
  const raw = req.originalUrl ?? req.url ?? '/';
  return redactSensitiveText(raw.split('?')[0] ?? '/');
};

export const createCorrelationIdMiddleware = (log: RequestLogger = defaultRequestLogger) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers[CORRELATION_ID_HEADER] ?? req.headers[CORRELATION_ID_ALIAS_HEADER];
    const raw = Array.isArray(header) ? header[0] : header;
    const correlationId = normalizeCorrelationId(raw) ?? randomUUID();
    const startedAt = Date.now();
    res.setHeader(CORRELATION_ID_RESPONSE_HEADER, correlationId);
    res.on('finish', () => {
      const line = JSON.stringify({
        event: 'http_request',
        correlationId,
        method: req.method,
        path: requestPath(req),
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
      runWithCorrelationId(correlationId, () => log(line));
    });
    runWithCorrelationId(correlationId, () => next());
  };
};

export const correlationIdMiddleware = createCorrelationIdMiddleware();
