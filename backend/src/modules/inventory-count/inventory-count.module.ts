import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { InventoryCountController } from './inventory-count.controller';
import { InventoryWarehouseCommitteeController } from './inventory-warehouse-committee.controller';
import { InventoryCountService } from './inventory-count.service';
import { InventorySessionCloseWorkerService } from './inventory-session-close-worker.service';

@Module({
  imports: [CommonModule, NotificationsModule, SettingsModule],
  controllers: [InventoryCountController, InventoryWarehouseCommitteeController],
  providers: [InventoryCountService, InventorySessionCloseWorkerService],
  exports: [InventoryCountService],
})
export class InventoryCountModule {}
