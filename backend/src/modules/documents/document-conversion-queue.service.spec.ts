import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentConversionQueueService } from './document-conversion-queue.service';
import type { DocumentConversionJobPayload } from './document-generation.queue';
import { runWithCorrelationId } from '../../common/utils/correlation-id.util';
import type { EnqueueConversionInput } from './document-conversion-queue.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const createService = (): {
  service: DocumentConversionQueueService;
  captured: { payload?: DocumentConversionJobPayload };
} => {
  const captured: { payload?: DocumentConversionJobPayload } = {};
  const row = {
    id: 'job-1',
    sourceType: 'transfer',
    sourceId: 'transfer-1',
    sourceFormat: 'docx',
    targetFormat: 'pdf',
    sourceRelativePath: 'prenosnice/source.docx',
    resultRelativePath: 'prenosnice/result.pdf',
    status: 'queued',
    bullJobId: null,
  };
  const documentJobs = {
    findLatestForSource: async () => null,
    create: async () => row,
    attachBullJobId: async () => ({ ...row, bullJobId: 'job-1' }),
    markFailed: async () => null,
  };
  const queue = {
    add: async (
      _name: string,
      payload: DocumentConversionJobPayload,
      options: { jobId?: string },
    ) => {
      captured.payload = payload;
      return { id: options.jobId };
    },
  };
  return {
    service: new DocumentConversionQueueService(queue as never, documentJobs as never),
    captured,
  };
};

const input: EnqueueConversionInput = {
  sourceType: 'transfer',
  sourceId: 'transfer-1',
  sourceFormat: 'docx',
  sourceRelativePath: 'prenosnice/source.docx',
  resultRelativePath: 'prenosnice/result.pdf',
};

test('document conversion payload reuses the active HTTP correlation ID', async () => {
  const { service, captured } = createService();
  await runWithCorrelationId('cid-http', () => service.enqueuePdfConversion(input));
  assert.equal(captured.payload?.correlationId, 'cid-http');
  assert.equal(captured.payload?.documentJobId, 'job-1');
});

test('background document conversion gets a generated correlation ID', async () => {
  const { service, captured } = createService();
  await service.enqueuePdfConversion(input);
  assert.match(captured.payload?.correlationId ?? '', UUID_RE);
});
