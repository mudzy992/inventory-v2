import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CommonModule } from '../../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { InventoryCountController } from './inventory-count.controller';
import { InventoryCountListController } from './inventory-count-list.controller';
import { InventoryWarehouseCommitteeController } from './inventory-warehouse-committee.controller';
import { InventoryCountService } from './inventory-count.service';
import { InventorySessionCloseWorkerService } from './inventory-session-close-worker.service';
import { InventorySessionCloseReconcilerService } from './inventory-session-close-reconciler.service';
import { EquipmentDisposalListService } from './equipment-disposal-list.service';
import { INVENTORY_SESSION_CLOSE_QUEUE } from './inventory-session-close.queue';

@Module({
  imports: [
    CommonModule,
    NotificationsModule,
    SettingsModule,
    BullModule.registerQueue({ name: INVENTORY_SESSION_CLOSE_QUEUE }),
  ],
  controllers: [
    InventoryCountController,
    InventoryCountListController,
    InventoryWarehouseCommitteeController,
  ],
  providers: [
    InventoryCountService,
    InventorySessionCloseWorkerService,
    InventorySessionCloseReconcilerService,
    EquipmentDisposalListService,
  ],
  exports: [InventoryCountService, EquipmentDisposalListService],
})
export class InventoryCountModule {}
