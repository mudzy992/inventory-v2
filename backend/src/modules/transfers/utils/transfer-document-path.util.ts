import { join } from 'node:path';
import { sanitizeDocumentNumberForFilename } from '../../../common/utils/document-number.util';

export const buildGeneratedDocxRelativePath = (
  warehouseId: string,
  year: number,
  documentNumber: string,
): string =>
  join(
    'prenosnice',
    warehouseId,
    String(year),
    `${sanitizeDocumentNumberForFilename(documentNumber)}.docx`,
  ).replace(/\\/g, '/');

export const buildGeneratedPdfRelativePath = (
  warehouseId: string,
  year: number,
  documentNumber: string,
): string =>
  join(
    'prenosnice',
    warehouseId,
    String(year),
    `${sanitizeDocumentNumberForFilename(documentNumber)}.pdf`,
  ).replace(/\\/g, '/');

export const buildSignedPdfRelativePath = (
  warehouseId: string,
  year: number,
  documentNumber: string,
  uploadId: string,
): string =>
  join(
    'prenosnice',
    warehouseId,
    String(year),
    `${sanitizeDocumentNumberForFilename(documentNumber)}-${uploadId}-signed.pdf`,
  ).replace(/\\/g, '/');
