import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { HttpException, HttpStatus } from '@nestjs/common';
import { TransferDocumentGenerationService } from './transfer-document-generation.service';

interface PdfDownloadHarness {
  service: TransferDocumentGenerationService;
  root: string;
  updates: unknown[];
  retries: string[];
  cleanup: () => void;
}

interface PdfDownloadOptions {
  generatedPdfPath: string | null;
  job: { id: string; status: string; resultRelativePath: string } | null;
  existingFiles?: string[];
}

const createHarness = (options: PdfDownloadOptions): PdfDownloadHarness => {
  const root = mkdtempSync(join(tmpdir(), 'inventory-pdf-download-'));
  for (const relativePath of options.existingFiles ?? []) {
    const absolutePath = join(root, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, '%PDF-1.4 test');
  }

  const updates: unknown[] = [];
  const retries: string[] = [];
  const service = new TransferDocumentGenerationService(
    {
      transfer: {
        findUnique: async () => ({
          documentNumber: 'TR-1',
          generatedDocxPath: 'generated/source.docx',
          generatedPdfPath: options.generatedPdfPath,
          generatedDocxStatus: 'done',
        }),
        update: async (args: unknown) => {
          updates.push(args);
          return { id: 'transfer-1' };
        },
      },
    } as never,
    {} as never,
    { getUploadRoot: () => root } as never,
    {} as never,
    { findLatestForSource: async () => options.job } as never,
  );
  const internals = service as unknown as {
    ensureDocxGenerated: () => Promise<void>;
    retryPdfGeneration: (transferId: string, requestedByUserId?: string) => Promise<void>;
  };
  internals.ensureDocxGenerated = async () => undefined;
  internals.retryPdfGeneration = async (transferId: string) => {
    retries.push(transferId);
  };

  return {
    service,
    root,
    updates,
    retries,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
};

const assertConflictStatus = (error: unknown, status: string): boolean => {
  if (!(error instanceof HttpException) || error.getStatus() !== HttpStatus.CONFLICT) {
    return false;
  }
  const response = error.getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    (response as { status?: unknown }).status === status
  );
};

test('repairs a stale PDF pointer from a completed job without duplicating conversion', async (t) => {
  const harness = createHarness({
    generatedPdfPath: 'generated/stale.pdf',
    job: { id: 'job-1', status: 'done', resultRelativePath: 'generated/actual.pdf' },
    existingFiles: ['generated/actual.pdf'],
  });
  t.after(harness.cleanup);

  const result = await harness.service.getGeneratedFileStream('transfer-1', 'pdf', 'user-1');

  assert.equal(result.absolutePath, join(harness.root, 'generated/actual.pdf'));
  assert.equal(result.mime, 'application/pdf');
  assert.equal(result.filename, 'TR-1.pdf');
  assert.deepEqual(harness.updates, [
    {
      where: { id: 'transfer-1' },
      data: { generatedPdfPath: 'generated/actual.pdf' },
    },
  ]);
  assert.deepEqual(harness.retries, []);
});

test('prefers the newest completed job result over an older readable PDF pointer', async (t) => {
  const harness = createHarness({
    generatedPdfPath: 'generated/old.pdf',
    job: { id: 'job-2', status: 'done', resultRelativePath: 'generated/actual.pdf' },
    existingFiles: ['generated/old.pdf', 'generated/actual.pdf'],
  });
  t.after(harness.cleanup);

  const result = await harness.service.getGeneratedFileStream('transfer-1', 'pdf');

  assert.equal(result.absolutePath, join(harness.root, 'generated/actual.pdf'));
  assert.deepEqual(harness.updates, [
    {
      where: { id: 'transfer-1' },
      data: { generatedPdfPath: 'generated/actual.pdf' },
    },
  ]);
  assert.deepEqual(harness.retries, []);
});

test('repairs a missing PDF pointer when the completed job result exists', async (t) => {
  const harness = createHarness({
    generatedPdfPath: null,
    job: { id: 'job-1', status: 'done', resultRelativePath: 'generated/actual.pdf' },
    existingFiles: ['generated/actual.pdf'],
  });
  t.after(harness.cleanup);

  const result = await harness.service.getGeneratedFileStream('transfer-1', 'pdf');

  assert.equal(result.absolutePath, join(harness.root, 'generated/actual.pdf'));
  assert.deepEqual(harness.updates, [
    {
      where: { id: 'transfer-1' },
      data: { generatedPdfPath: 'generated/actual.pdf' },
    },
  ]);
  assert.deepEqual(harness.retries, []);
});

test('re-enqueues PDF conversion when a completed job file was deleted', async (t) => {
  const harness = createHarness({
    generatedPdfPath: 'generated/missing.pdf',
    job: { id: 'job-1', status: 'done', resultRelativePath: 'generated/missing.pdf' },
  });
  t.after(harness.cleanup);

  await assert.rejects(
    harness.service.getGeneratedFileStream('transfer-1', 'pdf', 'user-1'),
    (error: unknown) => assertConflictStatus(error, 'processing'),
  );

  assert.deepEqual(harness.retries, ['transfer-1']);
  assert.deepEqual(harness.updates, [], 'a missing result must not be persisted as a valid PDF path');
});

test('does not enqueue a second conversion while a PDF retry is active', async (t) => {
  const harness = createHarness({
    generatedPdfPath: 'generated/missing.pdf',
    job: { id: 'job-2', status: 'running', resultRelativePath: 'generated/new.pdf' },
  });
  t.after(harness.cleanup);

  await assert.rejects(
    harness.service.getGeneratedFileStream('transfer-1', 'pdf', 'user-1'),
    (error: unknown) => assertConflictStatus(error, 'running'),
  );

  assert.deepEqual(harness.retries, []);
  assert.deepEqual(harness.updates, []);
});
