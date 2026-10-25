import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { PublicEquipmentController } from './public-equipment.controller';
import { PublicEquipmentRateLimitGuard } from './public-equipment-rate-limit.guard';
import { PublicEquipmentService } from './public-equipment.service';

@Module({
  imports: [SettingsModule],
  controllers: [PublicEquipmentController],
  providers: [PublicEquipmentService, PublicEquipmentRateLimitGuard],
})
export class PublicEquipmentModule {}
