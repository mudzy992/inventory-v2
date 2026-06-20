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
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateOrgUnitDto } from './dto/create-org-unit.dto';
import { SearchOrgUnitsQueryDto } from './dto/search-org-units-query.dto';
import { UpdateOrgUnitDto } from './dto/update-org-unit.dto';
import { OrgUnitsService } from './org-units.service';

@Controller('org-units')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrgUnitsController {
  constructor(private readonly orgUnitsService: OrgUnitsService) {}

  @Get()
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.user, UserRole.skladistar)
  findFlat(@CurrentUser() user: AuthenticatedUser) {
    return this.orgUnitsService.findFlat(user);
  }

  @Get('tree')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.user, UserRole.skladistar)
  findTree(@CurrentUser() user: AuthenticatedUser) {
    return this.orgUnitsService.findTree(user);
  }

  @Get('search')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.user, UserRole.skladistar)
  search(@CurrentUser() user: AuthenticatedUser, @Query() query: SearchOrgUnitsQueryDto) {
    return this.orgUnitsService.search(user, query);
  }

  @Get(':id/equipment-subtree-count')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.user, UserRole.skladistar)
  countEquipmentInSubtree(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orgUnitsService.countEquipmentInSubtree(user, id);
  }

  @Get(':id')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.user, UserRole.skladistar)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orgUnitsService.findOne(user, id);
  }

  @Post()
  @Roles(UserRole.admin, UserRole.moderator)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateOrgUnitDto) {
    return this.orgUnitsService.create(user, body);
  }

  @Patch(':id')
  @Roles(UserRole.admin, UserRole.moderator)
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: UpdateOrgUnitDto) {
    return this.orgUnitsService.update(user, id, body);
  }

  @Delete(':id')
  @Roles(UserRole.admin, UserRole.moderator)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orgUnitsService.remove(user, id);
  }
}
