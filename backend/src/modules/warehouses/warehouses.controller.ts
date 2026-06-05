import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '../../../generated/prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { ListWarehousesQueryDto } from './dto/list-warehouses-query.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseTransferTemplateService } from './warehouse-transfer-template.service';
import { WarehousesService } from './warehouses.service';

@Controller('warehouses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarehousesController {
  constructor(
    private readonly warehousesService: WarehousesService,
    private readonly transferTemplateService: WarehouseTransferTemplateService,
  ) {}

  @Get()
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.skladistar)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListWarehousesQueryDto) {
    return this.warehousesService.findAll(user, query);
  }

  @Get('resolve/effective')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.skladistar)
  resolveEffective(
    @Query('orgUnitId') orgUnitId: string,
    @Query('cityId') cityId?: string,
  ) {
    return this.warehousesService.resolveEffective(orgUnitId, cityId);
  }

  @Get(':id')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.skladistar)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.warehousesService.findOne(user, id);
  }

  @Post()
  @Roles(UserRole.admin)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateWarehouseDto) {
    return this.warehousesService.create(user, body);
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateWarehouseDto,
  ) {
    return this.warehousesService.update(user, id, body);
  }

  @Get(':id/ready-for-destruction')
  @Roles(UserRole.admin, UserRole.skladistar)
  listReadyForDestruction(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.warehousesService.listReadyForDestruction(user, id);
  }

  @Post(':id/destroy-equipment/:equipmentId')
  @Roles(UserRole.admin, UserRole.skladistar)
  destroyEquipment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('equipmentId') equipmentId: string,
  ) {
    return this.warehousesService.destroyEquipment(user, id, equipmentId);
  }

  @Get(':id/transfer-templates')
  @Roles(UserRole.admin)
  listTransferTemplates(@Param('id') id: string) {
    return this.transferTemplateService.listTemplates(id);
  }

  @Get(':id/transfer-template/active')
  @Roles(UserRole.admin, UserRole.evidenticar)
  getActiveTransferTemplate(@Param('id') id: string) {
    return this.transferTemplateService.getActiveTemplate(id);
  }

  @Post(':id/transfer-template')
  @Roles(UserRole.admin)
  @UseInterceptors(FileInterceptor('file'))
  uploadTransferTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('label') label?: string,
  ) {
    return this.transferTemplateService.uploadTemplate(user, id, file, label ?? '');
  }

  @Patch(':id/transfer-template/:templateId/activate')
  @Roles(UserRole.admin)
  activateTransferTemplate(@Param('id') id: string, @Param('templateId') templateId: string) {
    return this.transferTemplateService.activateTemplate(id, templateId);
  }

  @Get(':id/transfer-template/:templateId/download')
  @Roles(UserRole.admin)
  downloadTransferTemplate(
    @Param('id') id: string,
    @Param('templateId') templateId: string,
  ): Promise<StreamableFile> {
    return this.transferTemplateService.downloadTemplate(id, templateId);
  }
}
