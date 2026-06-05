import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { InventoryCountService } from './inventory-count.service';

@Controller('inventory-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryCountController {
  constructor(private readonly inventoryCountService: InventoryCountService) {}

  @Post()
  @Roles(UserRole.admin)
  createSession(
    @Body()
    body: {
      name: string;
      orgUnitId: string;
      year: number;
    },
  ) {
    return this.inventoryCountService.createSession(body);
  }

  @Get()
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('orgUnitId') orgUnitId?: string,
  ) {
    return this.inventoryCountService.findSessionsForUser(user, orgUnitId);
  }

  @Get('freeze-banner')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user, UserRole.skladistar)
  getFreezeBanner(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryCountService.getFreezeBannerForUser(user);
  }

  @Get(':id/committees/setup-options')
  @Roles(UserRole.admin)
  getCommitteeSetupOptions(
    @Param('id') sessionId: string,
    @Query('warehouseId') warehouseId: string,
    @Query('excludeCommitteeId') excludeCommitteeId?: string,
  ) {
    return this.inventoryCountService.getCommitteeSetupOptions(
      sessionId,
      warehouseId,
      excludeCommitteeId,
    );
  }

  @Get(':id/session-warehouses')
  @Roles(UserRole.admin)
  getSessionWarehouses(@Param('id') sessionId: string) {
    return this.inventoryCountService.getSessionWarehouses(sessionId);
  }

  @Get(':id/committees')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user)
  findCommittees(@Param('id') sessionId: string) {
    return this.inventoryCountService.findCommittees(sessionId);
  }

  @Get(':id/warehouse-committees')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.skladistar)
  findWarehouseCommittees(@Param('id') sessionId: string) {
    return this.inventoryCountService.findWarehouseCommittees(sessionId);
  }

  @Post(':id/committees')
  @Roles(UserRole.admin)
  createCommittee(
    @Param('id') sessionId: string,
    @Body()
    body: {
      warehouseId: string;
      categoryId: string;
      name?: string;
      inventoryMembers: { employeeId: string; role: 'predsjednik' | 'clan' }[];
      disposalMembers: { employeeId: string; role: 'predsjednik' | 'clan' }[];
    },
  ) {
    return this.inventoryCountService.createCommittee({
      sessionId,
      warehouseId: body.warehouseId,
      categoryId: body.categoryId,
      name: body.name,
      inventoryMembers: body.inventoryMembers,
      disposalMembers: body.disposalMembers,
    });
  }

  @Patch('committees/:id')
  @Roles(UserRole.admin)
  updateCommittee(
    @Param('id') committeeId: string,
    @Body()
    body: {
      warehouseId: string;
      categoryId: string;
      name?: string;
      inventoryMembers: { employeeId: string; role: 'predsjednik' | 'clan' }[];
      disposalMembers: { employeeId: string; role: 'predsjednik' | 'clan' }[];
    },
  ) {
    return this.inventoryCountService.updateCommittee(committeeId, body);
  }

  @Delete('committees/:id')
  @Roles(UserRole.admin)
  deleteCommittee(@Param('id') committeeId: string) {
    return this.inventoryCountService.deleteCommittee(committeeId);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  deleteSession(@Param('id') id: string) {
    return this.inventoryCountService.deleteSession(id);
  }

  @Patch(':id/activate')
  @Roles(UserRole.admin)
  activate(@Param('id') id: string) {
    return this.inventoryCountService.activateSession(id);
  }

  @Get('committees/:id/print-scope')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user)
  getPrintScope(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryCountService.getPrintScopeForUser(user, id);
  }

  @Get('committees/:id/report')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user)
  getCommitteeReport(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryCountService.getCommitteeReportForUser(user, id);
  }

  @Post('committees/:id/lines')
  @Roles(UserRole.evidenticar, UserRole.user)
  recordLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body()
    body: {
      equipmentId: string;
      status: 'prisutna' | 'ostecena' | 'promjena_lokacije' | 'nije_prisutna' | 'predlozen_rashod';
      note?: string;
      relocationTargetType?: 'skladiste' | 'osoba';
      relocationWarehouseId?: string;
      relocationToPersonId?: string;
    },
  ) {
    const relocation =
      body.relocationTargetType !== undefined
        ? {
            relocationTargetType: body.relocationTargetType,
            relocationWarehouseId: body.relocationWarehouseId,
            relocationToPersonId: body.relocationToPersonId,
          }
        : undefined;
    return this.inventoryCountService.recordLine(
      user,
      id,
      body.equipmentId,
      body.status,
      body.note,
      relocation,
    );
  }

  @Patch('committees/:id/close')
  @Roles(UserRole.evidenticar, UserRole.user)
  closeCommittee(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryCountService.closeCommittee(user, id);
  }

  @Patch(':id/close')
  @Roles(UserRole.admin)
  close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryCountService.closeSession(user, id);
  }

  @Get(':id/close-job')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user)
  getCloseJob(@Param('id') id: string) {
    return this.inventoryCountService.getCloseJob(id);
  }

  @Get(':id/report')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user)
  getSessionReport(@Param('id') id: string) {
    return this.inventoryCountService.getSessionReport(id);
  }

  @Get(':id/disposal-inbox')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user)
  getDisposalInbox(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryCountService.getDisposalInboxForUser(user, id);
  }

  @Get(':id/disposal-report')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user)
  getDisposalReport(@Param('id') id: string) {
    return this.inventoryCountService.getDisposalReport(id);
  }

  @Patch('disposal-approvals/:approvalId')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user)
  reviewDisposalApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('approvalId') approvalId: string,
    @Body() body: { approved: boolean; note?: string },
  ) {
    return this.inventoryCountService.reviewDisposalApproval(
      user,
      approvalId,
      body.approved,
      body.note,
    );
  }
}
