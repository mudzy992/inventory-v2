import { Module } from '@nestjs/common';
import { PublicEquipmentController } from './public-equipment.controller';
import { PublicEquipmentService } from './public-equipment.service';

@Module({
  controllers: [PublicEquipmentController],
  providers: [PublicEquipmentService],
})
export class PublicEquipmentModule {}
