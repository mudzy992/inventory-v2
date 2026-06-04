import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { CategoriesModule } from '../categories/categories.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TransfersModule } from '../transfers/transfers.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { WarehouseStockController } from './warehouse-stock.controller';
import { WarehouseStockService } from './warehouse-stock.service';

@Module({
  imports: [SettingsModule, CategoriesModule, WarehousesModule, NotificationsModule, TransfersModule],
  controllers: [WarehouseStockController],
  providers: [WarehouseStockService],
  exports: [WarehouseStockService],
})
export class WarehouseStockModule {}
