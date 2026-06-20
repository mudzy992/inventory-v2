import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { ListDisposalCommissionsQueryDto } from './dto/list-disposal-commissions-query.dto';
import { DisposalCommissionsService } from './disposal-commissions.service';

@Controller('disposal-commissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DisposalCommissionsController {
  constructor(private readonly disposalCommissionsService: DisposalCommissionsService) {}

  @Get()
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListDisposalCommissionsQueryDto) {
    return this.disposalCommissionsService.findAll(user, query);
  }

  @Get(':id')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.disposalCommissionsService.findOne(user, id);
  }
}
