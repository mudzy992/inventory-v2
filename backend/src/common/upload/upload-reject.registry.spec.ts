import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  recordUploadReject,
  setUploadRejectLogEnabled,
  uploadRejectRegistry,
} from './upload-reject.registry';

const at = new Date('2026-10-26T23:00:00.000Z');

describe('uploadRejectRegistry', () => {
  it('starts with empty lifetime and interval counters', () => {
    uploadRejectRegistry.reset(at);
    const snapshot = uploadRejectRegistry.snapshot(at);
    assert.equal(snapshot.totalRejects, 0);
    assert.equal(snapshot.intervalRejects, 0);
    assert.deepEqual(snapshot.byReason, {});
    assert.deepEqual(snapshot.byOperation, {});
    assert.equal(snapshot.lastReason, null);
  });

  it('counts rejects by reason and operation, including multiple operations', () => {
    uploadRejectRegistry.reset(at);
    const options = { emitLog: false } as const;
    recordUploadReject(
      { operation: 'signed_transfer_pdf', reason: 'invalid_mime', at },
      options,
    );
    recordUploadReject(
      { operation: 'signed_transfer_pdf', reason: 'size_limit', at },
      options,
    );
    recordUploadReject(
      { operation: 'transfer_template_docx', reason: 'invalid_extension', at },
      options,
    );
    const snapshot = uploadRejectRegistry.snapshot(at);
    assert.equal(snapshot.totalRejects, 3);
    assert.equal(snapshot.intervalRejects, 3);
    assert.deepEqual(snapshot.byOperation, {
      signed_transfer_pdf: 2,
      transfer_template_docx: 1,
    });
    assert.deepEqual(snapshot.byReason, {
      invalid_mime: 1,
      size_limit: 1,
      invalid_extension: 1,
    });
    assert.equal(snapshot.lastReason, 'invalid_extension');
    assert.equal(snapshot.lastRejectAt, at.toISOString());
  });

  it('drains only interval counters while keeping lifetime totals', () => {
    uploadRejectRegistry.reset(at);
    recordUploadReject(
      { operation: 'multipart', reason: 'multipart_size_limit', at },
      { emitLog: false },
    );
    const drained = uploadRejectRegistry.consumeSnapshot(at);
    assert.equal(drained.intervalRejects, 1);
    assert.equal(drained.totalRejects, 1);
    const next = uploadRejectRegistry.snapshot(at);
    assert.equal(next.intervalRejects, 0);
    assert.equal(next.totalRejects, 1);
    assert.deepEqual(next.byReason, { multipart_size_limit: 1 });
  });

  it('emits one structured warn line with correlation ID and authoritative fields', (t) => {
    uploadRejectRegistry.reset(at);
    const originalErr = process.stderr.write;
    const errors: string[] = [];
    process.stderr.write = ((chunk: string | Uint8Array) => {
      errors.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    t.after(() => {
      process.stderr.write = originalErr;
      setUploadRejectLogEnabled(true);
    });
    setUploadRejectLogEnabled(true);

    recordUploadReject({
      operation: 'signed_transfer_pdf',
      reason: 'size_limit',
      correlationId: 'cid-upload-1',
      details: {
        sizeBytes: 999,
        maxBytes: 100,
        event: 'spoofed',
        reason: 'spoofed_reason',
        password: 'ci-secret',
      },
      at,
    });

    assert.equal(errors.length, 1);
    const line = JSON.parse(errors[0]) as Record<string, unknown>;
    assert.equal(line.event, 'upload_rejected');
    assert.equal(line.reason, 'size_limit');
    assert.equal(line.operation, 'signed_transfer_pdf');
    assert.equal(line.correlationId, 'cid-upload-1');
    assert.equal(line.level, 'warn');
    assert.equal(line.sizeBytes, 999);
    assert.equal(line.password, '[redacted]');
    assert.equal(line.observedAt, at.toISOString());
  });

  it('can disable per-reject lines without affecting counters', () => {
    uploadRejectRegistry.reset(at);
    setUploadRejectLogEnabled(false);
    try {
      recordUploadReject({ operation: 'multipart', reason: 'multipart_reject', at });
      assert.equal(uploadRejectRegistry.snapshot(at).totalRejects, 1);
    } finally {
      setUploadRejectLogEnabled(true);
    }
  });
});
