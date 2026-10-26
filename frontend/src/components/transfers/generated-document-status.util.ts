export type GeneratedDocumentJobStatus = 'none' | 'queued' | 'running' | 'done' | 'failed';

export interface GeneratedDocumentStatusResponse {
  status: GeneratedDocumentJobStatus;
  jobId: string | null;
  error: string | null;
  docxStatus: 'not_requested' | 'queued' | 'running' | 'done' | 'failed';
  docxError: string | null;
  hasGeneratedDocument: boolean;
  hasGeneratedPdf: boolean;
}

export interface GeneratedPdfNotice {
  tone: 'info' | 'warning';
  message: string;
}

export const GENERATED_PDF_MESSAGES = {
  generating: 'PDF se generiše; preuzimanje će biti dostupno za nekoliko sekundi.',
  failed: 'Generisanje PDF-a nije uspjelo. Pokušajte ponovo.',
  missing:
    'PDF konverzija je završena, ali datoteka trenutno nije dostupna. Preuzimanje će pokrenuti ponovno generisanje.',
} as const;

export const shouldPollGeneratedDocumentStatus = (
  pdfStatus: GeneratedDocumentJobStatus,
  docxStatus: GeneratedDocumentStatusResponse['docxStatus'],
): boolean =>
  pdfStatus === 'queued' ||
  pdfStatus === 'running' ||
  docxStatus === 'queued' ||
  docxStatus === 'running';

/** Realtime events are emitted only to the user who requested the conversion.
 * Other viewers keep polling until they receive their own event, and everyone
 * falls back to polling while the socket is disconnected. */
export const shouldUseGeneratedDocumentPolling = (
  hasActiveJob: boolean,
  isConnected: boolean,
  hasRealtimeUpdate: boolean,
): boolean => hasActiveJob && (!isConnected || !hasRealtimeUpdate);

export const describeGeneratedPdfStatus = (
  status: GeneratedDocumentJobStatus,
  hasGeneratedPdf: boolean,
  error?: string | null,
): GeneratedPdfNotice | null => {
  if (status === 'queued' || status === 'running') {
    return { tone: 'info', message: GENERATED_PDF_MESSAGES.generating };
  }
  if (status === 'failed') {
    return { tone: 'warning', message: error || GENERATED_PDF_MESSAGES.failed };
  }
  if (status === 'done' && !hasGeneratedPdf) {
    return { tone: 'warning', message: GENERATED_PDF_MESSAGES.missing };
  }
  return null;
};
