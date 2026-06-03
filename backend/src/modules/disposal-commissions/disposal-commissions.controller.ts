import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { DisposalCommissionsService } from './disposal-commissions.service';

@Controller('disposal-commissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DisposalCommissionsController {
  constructor(private readonly disposalCommissionsService: DisposalCommissionsService) {}

  @Get()
  @Roles(UserRole.admin, UserRole.evidenticar)
  findAll(@Query('cityId') cityId?: string) {
    return this.disposalCommissionsService.findAll(cityId);
  }

  @Get('resolve')
  @Roles(UserRole.admin, UserRole.evidenticar)
  resolve(@Query('equipmentId') equipmentId: string) {
    return this.disposalCommissionsService.resolveForEquipment(equipmentId);
  }

  @Get('approvals/pending')
  @Roles(UserRole.admin, UserRole.evidenticar)
  findPending(@CurrentUser() user: AuthenticatedUser) {
    return this.disposalCommissionsService.findPendingApprovals(user);
  }

  @Post()
  @Roles(UserRole.admin)
  create(
    @Body()
    body: {
      cityId: string;
      name: string;
      members: { employeeId: string; role: 'predsjednik' | 'clan' }[];
    },
  ) {
    return this.disposalCommissionsService.create(body.cityId, body.name, body.members);
  }

  @Patch('approvals/:id/vote')
  @Roles(UserRole.admin, UserRole.evidenticar)
  vote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { approved: boolean; note?: string },
  ) {
    return this.disposalCommissionsService.vote(user, id, body.approved, body.note);
  }
}
