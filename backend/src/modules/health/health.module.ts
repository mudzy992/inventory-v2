import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { QueueMetricsService } from './queue-metrics.service';
import { SettingsModule } from '../settings/settings.module';
import { DOCUMENT_GENERATION_QUEUE } from '../documents/document-generation.queue';
import { INVENTORY_SESSION_CLOSE_QUEUE } from '../inventory-count/inventory-session-close.queue';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: INVENTORY_SESSION_CLOSE_QUEUE },
      { name: DOCUMENT_GENERATION_QUEUE },
    ),
  ],
  imports: [SettingsModule],
  controllers: [HealthController],
  providers: [QueueMetricsService],
})
export class HealthModule {}
