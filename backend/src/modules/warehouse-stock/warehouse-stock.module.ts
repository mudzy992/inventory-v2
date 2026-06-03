import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { WarehouseStockController } from './warehouse-stock.controller';
import { WarehouseStockService } from './warehouse-stock.service';

@Module({
  imports: [CategoriesModule, WarehousesModule, NotificationsModule],
  controllers: [WarehouseStockController],
  providers: [WarehouseStockService],
  exports: [WarehouseStockService],
})
export class WarehouseStockModule {}
