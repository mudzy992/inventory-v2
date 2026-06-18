import { Module } from '@nestjs/common';
import { InventoryCountModule } from '../inventory-count/inventory-count.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { TransferDocumentGenerationService } from './transfer-document-generation.service';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';

@Module({
  imports: [
    SettingsModule,
    WarehousesModule,
    NotificationsModule,
    InventoryCountModule,
  ],
  controllers: [TransfersController],
  providers: [TransfersService, TransferDocumentGenerationService],
  exports: [TransfersService, TransferDocumentGenerationService],
})
export class TransfersModule {}
