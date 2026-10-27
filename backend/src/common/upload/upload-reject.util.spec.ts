import assert from 'node:assert/strict';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { describe, it } from 'node:test';
import { classifyMultipartReject } from './upload-reject.util';

describe('classifyMultipartReject', () => {
  it('classifies HTTP 413 as a multipart size-limit rejection', () => {
    assert.deepEqual(classifyMultipartReject(new PayloadTooLargeException('too large')), {
      reason: 'multipart_size_limit',
      details: { httpStatus: 413, code: 'UNKNOWN' },
    });
  });

  it('uses a retained Multer LIMIT_FILE_SIZE code when present', () => {
    const error = Object.assign(new Error('File too large'), { code: 'LIMIT_FILE_SIZE' });
    assert.deepEqual(classifyMultipartReject(error), {
      reason: 'multipart_size_limit',
      details: { httpStatus: 0, code: 'LIMIT_FILE_SIZE' },
    });
  });

  it('classifies other transformed Multer errors without logging their message', () => {
    assert.deepEqual(classifyMultipartReject(new BadRequestException('Unexpected field')), {
      reason: 'multipart_reject',
      details: { httpStatus: 400, code: 'UNKNOWN' },
    });
  });

  it('rejects unsafe error codes instead of copying arbitrary user input', () => {
    const error = Object.assign(new Error('bad'), { code: 'LIMIT_FILE_SIZE\nspoofed' });
    assert.deepEqual(classifyMultipartReject(error), {
      reason: 'multipart_reject',
      details: { httpStatus: 0, code: 'UNKNOWN' },
    });
  });
});
