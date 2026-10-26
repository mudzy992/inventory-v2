import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDocumentJobTerminalOutboxRow,
  documentJobTerminalOutboxKey,
} from './document-job-terminal-outbox.util';

test('builds an idempotent durable notification for a completed document job', () => {
  const row = buildDocumentJobTerminalOutboxRow('job-1', 'user-1', 'done');
  assert.deepEqual(row, {
    idempotencyKey: 'document-job-terminal:job-1:done',
    userId: 'user-1',
    type: 'info',
    title: 'Generisanje dokumenta završeno',
    message: 'Generisani dokument je spreman za preuzimanje.',
    relatedId: 'job-1',
  });
});

test('includes a bounded client-safe failure reason and separates terminal keys', () => {
  const row = buildDocumentJobTerminalOutboxRow('job-1', 'user-1', 'failed', ' Konverzija nije uspjela. ');
  assert.equal(row.idempotencyKey, 'document-job-terminal:job-1:failed');
  assert.equal(row.title, 'Generisanje dokumenta nije uspjelo');
  assert.equal(row.message, 'Generisanje dokumenta nije uspjelo. Konverzija nije uspjela.');
  assert.notEqual(
    documentJobTerminalOutboxKey('job-1', 'done'),
    documentJobTerminalOutboxKey('job-1', 'failed'),
  );

  const longError = 'x'.repeat(700);
  const bounded = buildDocumentJobTerminalOutboxRow('job-2', 'user-1', 'failed', longError);
  assert.equal(bounded.message?.length, 500 + 'Generisanje dokumenta nije uspjelo. '.length);
});

test('falls back to a generic retry hint when no failure reason is available', () => {
  const row = buildDocumentJobTerminalOutboxRow('job-3', 'user-1', 'failed');
  assert.equal(row.message, 'Generisanje dokumenta nije uspjelo. Pokušajte ponovo.');
});
