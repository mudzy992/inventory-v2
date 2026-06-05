import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { SettingsModule } from '../settings/settings.module';
import { EquipmentCatalogController } from './equipment-catalog.controller';
import { EquipmentCatalogService } from './equipment-catalog.service';

@Module({
  imports: [CategoriesModule, SettingsModule],
  controllers: [EquipmentCatalogController],
  providers: [EquipmentCatalogService],
  exports: [EquipmentCatalogService],
})
export class EquipmentCatalogModule {}
