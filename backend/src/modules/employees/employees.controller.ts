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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { SearchEmployeesQueryDto } from './dto/search-employees-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.skladistar, UserRole.user, UserRole.popis_koordinator)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListEmployeesQueryDto) {
    return this.employeesService.findAll(user, query);
  }

  @Get('search')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.skladistar, UserRole.popis_koordinator)
  search(@CurrentUser() user: AuthenticatedUser, @Query() query: SearchEmployeesQueryDto) {
    return this.employeesService.search(user, query);
  }

  @Get(':id/profile')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.popis_koordinator)
  getProfile(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.employeesService.getProfile(user, id);
  }

  @Get(':id')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.skladistar, UserRole.user, UserRole.popis_koordinator)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.employeesService.findOne(user, id);
  }

  @Post()
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateEmployeeDto) {
    return this.employeesService.create(user, body);
  }

  @Patch(':id')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(user, id, body);
  }

  @Delete(':id')
  @Roles(UserRole.admin, UserRole.moderator)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.employeesService.remove(user, id);
  }
}
