/**
 * MORA ostati usklađeno sa
 * backend/src/modules/documents/document-generation.queue.ts — odvojeni
 * npm paketi/procesi, pa se tip namjerno duplira umjesto import-a preko
 * granice repozitorija. Bilo koja izmjena payload šeme na backend strani
 * mora biti ogledana i ovdje.
 */
export type DocumentSourceFormat = 'docx' | 'xlsx' | 'odt';

export interface DocumentConversionJobPayload {
  /** Correlation ID propagated from the originating backend request. */
  correlationId?: string;
  documentJobId: string;
  sourceFormat: DocumentSourceFormat;
  targetFormat: 'pdf';
  sourceRelativePath: string;
  resultRelativePath: string;
}

export interface DocumentConversionJobResult {
  documentJobId: string;
  resultRelativePath: string;
}

export const SUPPORTED_SOURCE_EXTENSIONS: Record<DocumentSourceFormat, string> = {
  docx: '.docx',
  xlsx: '.xlsx',
  odt: '.odt',
};
