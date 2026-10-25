import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { PublicEquipmentRateLimitGuard } from './public-equipment-rate-limit.guard';
import { PublicEquipmentService } from './public-equipment.service';

@Controller('public/equipment')
export class PublicEquipmentController {
  constructor(private readonly publicEquipmentService: PublicEquipmentService) {}

  @Get(':id')
  @UseGuards(PublicEquipmentRateLimitGuard)
  findOne(@Param('id') id: string) {
    return this.publicEquipmentService.findOne(id);
  }
}
