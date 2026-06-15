import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { InventoryCountController } from './inventory-count.controller';
import { InventoryCountListController } from './inventory-count-list.controller';
import { InventoryWarehouseCommitteeController } from './inventory-warehouse-committee.controller';
import { InventoryCountService } from './inventory-count.service';
import { InventorySessionCloseWorkerService } from './inventory-session-close-worker.service';
import { EquipmentDisposalListService } from './equipment-disposal-list.service';

@Module({
  imports: [CommonModule, NotificationsModule, SettingsModule],
  controllers: [
    InventoryCountController,
    InventoryCountListController,
    InventoryWarehouseCommitteeController,
  ],
  providers: [InventoryCountService, InventorySessionCloseWorkerService, EquipmentDisposalListService],
  exports: [InventoryCountService, EquipmentDisposalListService],
})
export class InventoryCountModule {}
