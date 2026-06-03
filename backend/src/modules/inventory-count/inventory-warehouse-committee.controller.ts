import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { InventoryCountService } from './inventory-count.service';

@Controller('inventory-warehouse-committees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryWarehouseCommitteeController {
  constructor(private readonly inventoryCountService: InventoryCountService) {}

  @Get('mine')
  @Roles(UserRole.skladistar, UserRole.admin)
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryCountService.findWarehouseCommitteesForUser(user);
  }

  @Get(':id/scope')
  @Roles(UserRole.skladistar, UserRole.admin)
  getScope(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryCountService.getWarehouseCommitteeScope(user, id);
  }

  @Post(':id/lines')
  @Roles(UserRole.skladistar)
  recordLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body()
    body: {
      stockLotId: string;
      status: 'prisutna' | 'nije_prisutna' | 'ostecena';
      quantityCounted: number;
      note?: string;
    },
  ) {
    return this.inventoryCountService.recordWarehouseLine(
      user,
      id,
      body.stockLotId,
      body.status,
      body.quantityCounted,
      body.note,
    );
  }

  @Patch(':id/close')
  @Roles(UserRole.skladistar)
  close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryCountService.closeWarehouseCommittee(user, id);
  }
}
