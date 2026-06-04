import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { PublicEquipmentController } from './public-equipment.controller';
import { PublicEquipmentService } from './public-equipment.service';

@Module({
  imports: [SettingsModule],
  controllers: [PublicEquipmentController],
  providers: [PublicEquipmentService],
})
export class PublicEquipmentModule {}
