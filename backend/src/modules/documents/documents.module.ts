import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsModule } from '../notifications/notifications.module';
import { DOCUMENT_GENERATION_QUEUE } from './document-generation.queue';
import { DocumentConversionQueueService } from './document-conversion-queue.service';
import { DocumentConversionEventsService } from './document-conversion-events.service';
import { DocumentJobsService } from './document-jobs.service';

/**
 * Generički "Document Engine" sloj — enqueue/status/retry za konverziju
 * dokumenata (trenutno DOCX/XLSX/ODT → PDF preko zasebnog Document Worker
 * servisa, vidi document-worker/). Namjerno bez sopstvenog Controller-a:
 * svaki modul koji generiše dokumente (trenutno samo transfers/) dodaje
 * SVOJE tanke HTTP rute koje delegiraju ovim servisima, zadržavajući
 * postojeći access-control obrazac tog modula (npr.
 * TransfersService.canAccessTransfer) umjesto generičkog cross-cutting
 * autorizacijskog sloja ovdje.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: DOCUMENT_GENERATION_QUEUE }),
    NotificationsModule,
  ],
  providers: [DocumentJobsService, DocumentConversionQueueService, DocumentConversionEventsService],
  exports: [DocumentJobsService, DocumentConversionQueueService],
})
export class DocumentsModule {}
