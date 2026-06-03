import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { ListEquipmentQueryDto } from './dto/list-equipment-query.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';
import { EquipmentService } from './equipment.service';

@Controller('equipment')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Get()
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user, UserRole.skladistar)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListEquipmentQueryDto) {
    return this.equipmentService.findAll(user, query);
  }

  @Get(':id/qr')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user)
  getQr(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.equipmentService.getQrPayload(user, id);
  }

  @Get(':id')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.equipmentService.findOne(user, id);
  }

  @Post()
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.skladistar)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateEquipmentDto) {
    return this.equipmentService.create(user, body);
  }

  @Patch(':id')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.skladistar)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateEquipmentDto,
  ) {
    return this.equipmentService.update(user, id, body);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.equipmentService.remove(user, id);
  }
}
