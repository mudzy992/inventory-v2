import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { InstallMaintenancePartDto } from './dto/install-part.dto';
import { ReceiveMaintenanceLotDto } from './dto/receive-maintenance-lot.dto';
import { ReplaceMaintenancePartDto } from './dto/replace-part.dto';
import { MaintenanceConsumptionQueryDto } from './dto/consumption-query.dto';
import { SetCategoryMaintenanceLinksDto } from './dto/set-category-links.dto';
import { MaintenancePartsService } from './maintenance-parts.service';

@Controller('maintenance-parts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MaintenancePartsController {
  constructor(private readonly maintenancePartsService: MaintenancePartsService) {}

  @Get('linked-host-categories')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.skladistar)
  listLinkedHostCategories() {
    return this.maintenancePartsService.listLinkedHostCategories();
  }

  @Get('category-links/:hostCategoryId')
  @Roles(UserRole.admin, UserRole.evidenticar)
  getCategoryLinks(@Param('hostCategoryId') hostCategoryId: string) {
    return this.maintenancePartsService.getCategoryLinks(hostCategoryId);
  }

  @Put('category-links/:hostCategoryId')
  @Roles(UserRole.admin)
  setCategoryLinks(
    @Param('hostCategoryId') hostCategoryId: string,
    @Body() body: SetCategoryMaintenanceLinksDto,
  ) {
    return this.maintenancePartsService.setCategoryLinks(
      hostCategoryId,
      body.maintenanceCategoryIds,
    );
  }

  @Get('warehouses/:warehouseId/consumption-summary')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.skladistar)
  getConsumptionSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('warehouseId') warehouseId: string,
    @Query() query: MaintenanceConsumptionQueryDto,
  ) {
    return this.maintenancePartsService.getWarehouseConsumptionSummary(
      user,
      warehouseId,
      query.hostCategoryId,
    );
  }

  @Get('warehouses/:warehouseId/stock-lots')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.skladistar)
  listMaintenanceLots(
    @CurrentUser() user: AuthenticatedUser,
    @Param('warehouseId') warehouseId: string,
  ) {
    return this.maintenancePartsService.listMaintenanceLots(user, warehouseId);
  }

  @Post('warehouses/:warehouseId/stock-lots')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.skladistar)
  receiveMaintenanceLot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('warehouseId') warehouseId: string,
    @Body() body: ReceiveMaintenanceLotDto,
  ) {
    return this.maintenancePartsService.receiveMaintenanceLot(user, warehouseId, body);
  }

  @Get('equipment/:equipmentId/parts')
  @Roles(UserRole.admin, UserRole.evidenticar)
  listInstalledParts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('equipmentId') equipmentId: string,
  ) {
    return this.maintenancePartsService.listInstalledParts(user, equipmentId);
  }

  @Get('equipment/:equipmentId/available-lots/:maintenanceCategoryId')
  @Roles(UserRole.admin, UserRole.evidenticar)
  listAvailableLots(
    @CurrentUser() user: AuthenticatedUser,
    @Param('equipmentId') equipmentId: string,
    @Param('maintenanceCategoryId') maintenanceCategoryId: string,
  ) {
    return this.maintenancePartsService.listAvailableLotsForHost(
      user,
      equipmentId,
      maintenanceCategoryId,
    );
  }

  @Post('equipment/:equipmentId/install')
  @Roles(UserRole.admin, UserRole.evidenticar)
  installPart(
    @CurrentUser() user: AuthenticatedUser,
    @Param('equipmentId') equipmentId: string,
    @Body() body: InstallMaintenancePartDto,
  ) {
    return this.maintenancePartsService.installPart(user, equipmentId, body);
  }

  @Patch('parts/:partId/faulty')
  @Roles(UserRole.admin, UserRole.evidenticar)
  markFaulty(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partId') partId: string,
    @Body() body: { note?: string },
  ) {
    return this.maintenancePartsService.markPartFaulty(user, partId, body.note);
  }

  @Patch('parts/:partId/remove')
  @Roles(UserRole.admin, UserRole.evidenticar)
  removePart(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partId') partId: string,
    @Body() body: { note?: string },
  ) {
    return this.maintenancePartsService.removePart(user, partId, body.note);
  }

  @Post('parts/:partId/replace')
  @Roles(UserRole.admin, UserRole.evidenticar)
  replacePart(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partId') partId: string,
    @Body() body: ReplaceMaintenancePartDto,
  ) {
    return this.maintenancePartsService.replacePart(user, partId, body);
  }
}
