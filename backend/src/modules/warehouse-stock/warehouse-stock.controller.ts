import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateStockLotDto } from './dto/create-stock-lot.dto';
import { IssueStockLotDto } from './dto/issue-stock-lot.dto';
import { UpdateStockLotSpecDto } from './dto/update-stock-lot-spec.dto';
import { WarehouseStockService } from './warehouse-stock.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarehouseStockController {
  constructor(private readonly warehouseStockService: WarehouseStockService) {}

  @Get('warehouse-stock/assigned')
  @Roles(UserRole.admin, UserRole.evidenticar)
  listAssigned(@CurrentUser() user: AuthenticatedUser) {
    return this.warehouseStockService.listForRegistrar(user);
  }

  @Get('warehouses/:warehouseId/stock-lots')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.skladistar)
  listByWarehouse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('warehouseId') warehouseId: string,
  ) {
    return this.warehouseStockService.listForWarehouse(user, warehouseId);
  }

  @Post('warehouses/:warehouseId/stock-lots')
  @Roles(UserRole.admin, UserRole.skladistar)
  receive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('warehouseId') warehouseId: string,
    @Body() body: CreateStockLotDto,
  ) {
    return this.warehouseStockService.receive(user, warehouseId, body);
  }

  @Get('stock-lots/:id')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.skladistar)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.warehouseStockService.findOne(user, id);
  }

  @Patch('stock-lots/:id/specifications')
  @Roles(UserRole.admin, UserRole.evidenticar)
  defineSpec(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateStockLotSpecDto,
  ) {
    return this.warehouseStockService.defineSpecifications(user, id, body);
  }

  @Post('stock-lots/:id/issue')
  @Roles(UserRole.admin, UserRole.evidenticar)
  issue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: IssueStockLotDto,
  ) {
    return this.warehouseStockService.issueUnit(user, id, body);
  }
}
