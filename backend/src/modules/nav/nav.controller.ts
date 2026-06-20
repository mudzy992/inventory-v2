import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { NavService } from './nav.service';

@Controller('nav')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NavController {
  constructor(private readonly navService: NavService) {}

  @Get('module-badges')
  @Roles(
    UserRole.admin,
    UserRole.moderator,
    UserRole.evidenticar,
    UserRole.popis_koordinator,
    UserRole.skladistar,
    UserRole.user,
  )
  getModuleBadges(@CurrentUser() user: AuthenticatedUser) {
    return this.navService.getModuleBadges(user);
  }
}
