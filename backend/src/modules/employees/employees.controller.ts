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
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.skladistar, UserRole.user)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListEmployeesQueryDto) {
    return this.employeesService.findAll(user, query);
  }

  @Get(':id')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.skladistar, UserRole.user)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.employeesService.findOne(user, id);
  }

  @Post()
  @Roles(UserRole.admin)
  create(@Body() body: CreateEmployeeDto) {
    return this.employeesService.create(body);
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  update(@Param('id') id: string, @Body() body: UpdateEmployeeDto) {
    return this.employeesService.update(id, body);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  remove(@Param('id') id: string) {
    return this.employeesService.remove(id);
  }
}
