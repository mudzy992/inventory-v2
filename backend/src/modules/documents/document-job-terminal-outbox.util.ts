import type { Prisma } from '../../../generated/prisma/client';

export type DocumentJobTerminalStatus = 'done' | 'failed';

const TERMINAL_NOTIFICATION_MAX_LENGTH = 500;

export const documentJobTerminalOutboxKey = (
  documentJobId: string,
  status: DocumentJobTerminalStatus,
): string => `document-job-terminal:${documentJobId}:${status}`;

/**
 * Builds the durable notification counterpart of a terminal DocumentJob
 * transition. The idempotency key lets QueueEvents handlers and the periodic
 * reconciler race without producing duplicate notifications for the same job.
 */
export const buildDocumentJobTerminalOutboxRow = (
  documentJobId: string,
  userId: string,
  status: DocumentJobTerminalStatus,
  error?: string | null,
): Prisma.NotificationOutboxCreateManyInput => {
  const suffix = error?.trim()
    ? ` ${error.trim().slice(0, TERMINAL_NOTIFICATION_MAX_LENGTH)}`
    : ' Pokušajte ponovo.';
  return {
    idempotencyKey: documentJobTerminalOutboxKey(documentJobId, status),
    userId,
    type: 'info',
    title:
      status === 'done'
        ? 'Generisanje dokumenta završeno'
        : 'Generisanje dokumenta nije uspjelo',
    message:
      status === 'done'
        ? 'Generisani dokument je spreman za preuzimanje.'
        : `Generisanje dokumenta nije uspjelo.${suffix}`,
    relatedId: documentJobId,
  };
};
