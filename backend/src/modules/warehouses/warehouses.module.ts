import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { WarehousesController } from './warehouses.controller';
import { WarehouseTransferTemplateService } from './warehouse-transfer-template.service';
import { WarehousesService } from './warehouses.service';

@Module({
  imports: [SettingsModule],
  controllers: [WarehousesController],
  providers: [WarehousesService, WarehouseTransferTemplateService],
  exports: [WarehousesService, WarehouseTransferTemplateService],
})
export class WarehousesModule {}
