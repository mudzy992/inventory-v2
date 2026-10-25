import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';
import { UserRole } from '../../../generated/prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CheckInventoryNumberQueryDto } from './dto/check-inventory-number-query.dto';
import { CheckSpecificationValueQueryDto } from './dto/check-specification-value-query.dto';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { EquipmentSummaryQueryDto } from './dto/equipment-summary-query.dto';
import { EquipmentLotGroupsQueryDto } from './dto/equipment-lot-groups-query.dto';
import { ListEquipmentQueryDto } from './dto/list-equipment-query.dto';
import { ResolveCustodyPoolQueryDto } from './dto/resolve-custody-pool-query.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';
import { ReactivateEquipmentDto } from './dto/reactivate-equipment.dto';
import { EquipmentService } from './equipment.service';

@Controller('equipment')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Get()
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.user, UserRole.skladistar)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListEquipmentQueryDto) {
    return this.equipmentService.findAll(user, query);
  }

  @Get('summary')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.user, UserRole.skladistar)
  getSummary(@CurrentUser() user: AuthenticatedUser, @Query() query: EquipmentSummaryQueryDto) {
    return this.equipmentService.getSummary(user, query.categoryId);
  }

  @Get('lot-groups')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.user, UserRole.skladistar)
  getLotGroups(@CurrentUser() user: AuthenticatedUser, @Query() query: EquipmentLotGroupsQueryDto) {
    return this.equipmentService.getLotGroups(user, query.categoryId);
  }

  @Get('export/csv')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.moderator)
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListEquipmentQueryDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="oprema.csv"');
    await pipeline(Readable.from(this.equipmentService.exportCsv(user, query)), res);
  }

  @Get('check/inventory-number')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.moderator)
  checkInventoryNumber(@Query() query: CheckInventoryNumberQueryDto) {
    return this.equipmentService.checkInventoryNumberAvailable(query.value);
  }

  @Get('check/specification-value')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.moderator)
  checkSpecificationValue(@Query() query: CheckSpecificationValueQueryDto) {
    return this.equipmentService.checkUniqueSpecificationValue(
      query.categoryId,
      query.fieldId,
      query.value,
    );
  }

  @Get('resolve-custody-pool')
  @Roles(UserRole.evidenticar)
  resolveCustodyPool(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ResolveCustodyPoolQueryDto,
  ) {
    return this.equipmentService.resolveCustodyPool(user, query.inventoryNumber);
  }

  @Get(':id/qr')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.moderator, UserRole.user)
  getQr(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.equipmentService.getQrPayload(user, id);
  }

  @Get(':id')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.user)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.equipmentService.findOne(user, id);
  }

  @Post()
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.skladistar, UserRole.moderator)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateEquipmentDto) {
    return this.equipmentService.create(user, body);
  }

  @Patch(':id')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.skladistar, UserRole.moderator)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateEquipmentDto,
  ) {
    return this.equipmentService.update(user, id, body);
  }

  @Post(':id/reactivate')
  @Roles(UserRole.admin, UserRole.moderator)
  reactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ReactivateEquipmentDto,
  ) {
    return this.equipmentService.reactivate(user, id, body.reason);
  }

  @Delete(':id')
  @Roles(UserRole.admin, UserRole.moderator)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.equipmentService.remove(user, id);
  }
}
