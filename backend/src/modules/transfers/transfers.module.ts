import { Module } from '@nestjs/common';
import { DisposalCommissionsModule } from '../disposal-commissions/disposal-commissions.module';
import { InventoryCountModule } from '../inventory-count/inventory-count.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';

@Module({
  imports: [SettingsModule, NotificationsModule, DisposalCommissionsModule, InventoryCountModule],
  controllers: [TransfersController],
  providers: [TransfersService],
  exports: [TransfersService],
})
export class TransfersModule {}
