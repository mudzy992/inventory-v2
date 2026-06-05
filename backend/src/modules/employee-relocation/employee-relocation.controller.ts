import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PreviewRelocationQueryDto } from './dto/preview-relocation-query.dto';
import { ResolveDestDto } from './dto/resolve-dest.dto';
import { ResolveSourceDto } from './dto/resolve-source.dto';
import { EmployeeRelocationService } from './employee-relocation.service';

@Controller('employee-relocation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeeRelocationController {
  constructor(private readonly relocationService: EmployeeRelocationService) {}

  @Get('preview')
  @Roles(UserRole.admin)
  preview(@Query() query: PreviewRelocationQueryDto) {
    return this.relocationService.preview(query);
  }

  @Get('admin-alerts')
  @Roles(UserRole.admin)
  adminAlerts() {
    return this.relocationService.getAdminAlerts();
  }

  @Get()
  @Roles(UserRole.admin, UserRole.evidenticar)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.relocationService.listForUser(user);
  }

  @Get('cases/:id')
  @Roles(UserRole.admin, UserRole.evidenticar)
  getCase(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.relocationService.getCase(user, id);
  }

  @Get('equipment/:equipmentId/events')
  @Roles(UserRole.admin, UserRole.evidenticar)
  equipmentEvents(@Param('equipmentId') equipmentId: string) {
    return this.relocationService.listEventsForEquipment(equipmentId);
  }

  @Patch('lines/:id/source')
  @Roles(UserRole.admin, UserRole.evidenticar)
  resolveSource(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ResolveSourceDto,
  ) {
    return this.relocationService.resolveSource(user, id, body.action);
  }

  @Patch('lines/:id/dest')
  @Roles(UserRole.admin, UserRole.evidenticar)
  resolveDest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ResolveDestDto,
  ) {
    return this.relocationService.resolveDest(user, id, body.action);
  }
}
