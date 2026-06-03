import { Controller, Get, Param } from '@nestjs/common';
import { PublicEquipmentService } from './public-equipment.service';

@Controller('public/equipment')
export class PublicEquipmentController {
  constructor(private readonly publicEquipmentService: PublicEquipmentService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.publicEquipmentService.findOne(id);
  }
}
