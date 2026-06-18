import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ListDisposalCommissionsQueryDto } from './dto/list-disposal-commissions-query.dto';
import { DisposalCommissionsService } from './disposal-commissions.service';

@Controller('disposal-commissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DisposalCommissionsController {
  constructor(private readonly disposalCommissionsService: DisposalCommissionsService) {}

  @Get()
  @Roles(UserRole.admin, UserRole.evidenticar)
  findAll(@Query() query: ListDisposalCommissionsQueryDto) {
    return this.disposalCommissionsService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.admin, UserRole.evidenticar)
  findOne(@Param('id') id: string) {
    return this.disposalCommissionsService.findOne(id);
  }
}
