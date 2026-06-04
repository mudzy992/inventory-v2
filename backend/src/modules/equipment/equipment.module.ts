import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { CategoriesModule } from '../categories/categories.module';
import { EquipmentController } from './equipment.controller';
import { EquipmentService } from './equipment.service';

@Module({
  imports: [SettingsModule, CategoriesModule, WarehousesModule],
  controllers: [EquipmentController],
  providers: [EquipmentService],
})
export class EquipmentModule {}
