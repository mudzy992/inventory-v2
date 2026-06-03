import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateOrgUnitDto } from './dto/create-org-unit.dto';
import { UpdateOrgUnitDto } from './dto/update-org-unit.dto';
import { OrgUnitsService } from './org-units.service';

@Controller('org-units')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrgUnitsController {
  constructor(private readonly orgUnitsService: OrgUnitsService) {}

  @Get()
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user, UserRole.skladistar)
  findFlat() {
    return this.orgUnitsService.findFlat();
  }

  @Get('tree')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user, UserRole.skladistar)
  findTree() {
    return this.orgUnitsService.findTree();
  }

  @Get(':id')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user, UserRole.skladistar)
  findOne(@Param('id') id: string) {
    return this.orgUnitsService.findOne(id);
  }

  @Post()
  @Roles(UserRole.admin)
  create(@Body() body: CreateOrgUnitDto) {
    return this.orgUnitsService.create(body);
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  update(@Param('id') id: string, @Body() body: UpdateOrgUnitDto) {
    return this.orgUnitsService.update(id, body);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  remove(@Param('id') id: string) {
    return this.orgUnitsService.remove(id);
  }
}
