import { HttpException } from '@nestjs/common';
import type { UploadRejectDetails, UploadRejectReason } from './upload-reject.registry';

const SAFE_ERROR_CODE = /^[A-Z0-9_]{1,64}$/u;

export interface MultipartRejectClassification {
  reason: UploadRejectReason;
  details: UploadRejectDetails;
}

/** FileInterceptor converts Multer errors into HttpExceptions before they
 * reach our interceptor, so classify by status/code without logging the
 * original error message (it can contain user-controlled field names). */
export const classifyMultipartReject = (error: unknown): MultipartRejectClassification => {
  const httpStatus = error instanceof HttpException ? error.getStatus() : null;
  const rawCode =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  const code = typeof rawCode === 'string' && SAFE_ERROR_CODE.test(rawCode) ? rawCode : 'UNKNOWN';
  const reason: UploadRejectReason =
    httpStatus === 413 || code === 'LIMIT_FILE_SIZE'
      ? 'multipart_size_limit'
      : 'multipart_reject';
  return {
    reason,
    details: {
      httpStatus: httpStatus ?? 0,
      code,
    },
  };
};
