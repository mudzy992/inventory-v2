import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { SettingsModule } from '../settings/settings.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { MaintenancePartsController } from './maintenance-parts.controller';
import { MaintenancePartsService } from './maintenance-parts.service';

@Module({
  imports: [SettingsModule, CategoriesModule, WarehousesModule],
  controllers: [MaintenancePartsController],
  providers: [MaintenancePartsService],
  exports: [MaintenancePartsService],
})
export class MaintenancePartsModule {}
