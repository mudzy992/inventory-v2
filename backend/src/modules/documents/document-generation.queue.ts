/**
 * BullMQ red za konverziju dokumenata (npr. DOCX prenosnice → PDF za
 * štampu). Posao NE obrađuje backend proces — konzumira ga zaseban
 * Document Worker servis (document-worker/, LibreOffice), koji je čist
 * Node/BullMQ proces bez NestJS-a. Backend ovdje samo:
 *  - enqueue-uje posao (DocumentConversionQueueService),
 *  - sluša BullMQ QueueEvents za taj red (DocumentConversionEventsService)
 *    i na osnovu njih ažurira `DocumentJob` Postgres red + emituje
 *    Socket.IO update pozivaocu.
 *
 * VAŽNO: `DocumentConversionJobPayload` mora ostati usklađen sa
 * `document-worker/src/types.ts` (odvojen npm paket/proces — TypeScript
 * tipovi se namjerno NE dijele preko granice procesa). Svaka izmjena ovog
 * interfejsa mora biti ogledana i tamo.
 */
export const DOCUMENT_GENERATION_QUEUE = 'document-generation';
export const DOCUMENT_CONVERT_JOB_NAME = 'convert-to-pdf';

export type DocumentSourceFormat = 'docx' | 'xlsx' | 'odt';

export interface DocumentConversionJobPayload {
  /** DocumentJob.id — worker ne dira Postgres, ali prosljeđuje ovo polje
   * nazad u job return value radi jednostavnijeg logovanja/korelacije. */
  documentJobId: string;
  /** Format izvornog fajla — određuje koji soffice filter se koristi. */
  sourceFormat: DocumentSourceFormat;
  /** Trenutno uvijek 'pdf' — polje postoji radi buduće ekstenzije (npr.
   * konverzija u ODT ili sliku) bez izmjene payload šeme. */
  targetFormat: 'pdf';
  /** Putanja RELATIVNA na UPLOAD_DIR — nikad apsolutna, jer backend i
   * document-worker mogu imati (u teoriji) drugačiji mount path; svaki
   * proces je resolvuje protiv svog vlastitog UPLOAD_DIR env-a. */
  sourceRelativePath: string;
  /** Gdje worker treba upisati rezultat, opet relativno na UPLOAD_DIR. */
  resultRelativePath: string;
}

export interface DocumentConversionJobResult {
  documentJobId: string;
  resultRelativePath: string;
}
