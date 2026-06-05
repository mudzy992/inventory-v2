import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { ListCommitteesQueryDto } from './dto/list-committees-query.dto';
import { ListInventoryLinesQueryDto } from './dto/list-inventory-lines-query.dto';
import { ListSessionsQueryDto } from './dto/list-sessions-query.dto';
import { InventoryCountService } from './inventory-count.service';

@Controller('inventory-count')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryCountListController {
  constructor(private readonly inventoryCountService: InventoryCountService) {}

  @Get('sessions')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user)
  findSessions(@CurrentUser() user: AuthenticatedUser, @Query() query: ListSessionsQueryDto) {
    return this.inventoryCountService.findSessionsForUser(user, query);
  }

  @Get('sessions/:id/committees')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user)
  findCommittees(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') sessionId: string,
    @Query() query: ListCommitteesQueryDto,
  ) {
    return this.inventoryCountService.findCommitteesPaginated(user, sessionId, query);
  }

  @Get('committees/:id/lines')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user)
  findLines(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') committeeId: string,
    @Query() query: ListInventoryLinesQueryDto,
  ) {
    return this.inventoryCountService.findCommitteeLinesPaginated(user, committeeId, query);
  }

  @Get('committees/:id/equipment-scope')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user)
  findEquipmentScope(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') committeeId: string,
    @Query() query: ListCommitteesQueryDto,
  ) {
    return this.inventoryCountService.findCommitteeEquipmentScopePaginated(user, committeeId, query);
  }
}
