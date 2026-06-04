import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Employee, Prisma } from '../../../generated/prisma/client';
import { LocationResolutionService } from '../../common/services/location-resolution.service';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registrarScope: RegistrarScopeService,
    private readonly locationResolutionService: LocationResolutionService,
    private readonly settingsService: SettingsService,
  ) {}

  async findAll(user: AuthenticatedUser, query: ListEmployeesQueryDto): Promise<Employee[]> {
    const employees = await this.prisma.employee.findMany({
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    let filtered = employees;
    if (user.role === 'user') {
      filtered = user.employeeId
        ? employees.filter((employee) => employee.id === user.employeeId)
        : [];
    } else if (user.role === 'evidenticar') {
      const scoped: Employee[] = [];
      for (const employee of employees) {
        if (await this.registrarScope.canAccessEmployee(user, employee)) {
          scoped.push(employee);
        }
      }
      filtered = scoped;
    }
    if (query.orgUnitId) {
      filtered = filtered.filter((employee) => employee.orgUnitId === query.orgUnitId);
    }
    if (query.search) {
      const term = query.search.toLowerCase();
      filtered = filtered.filter(
        (employee) =>
          employee.firstName.toLowerCase().includes(term) ||
          employee.lastName.toLowerCase().includes(term) ||
          (employee.email?.toLowerCase().includes(term) ?? false),
      );
    }
    return filtered;
  }

  async findOne(user: AuthenticatedUser, id: string): Promise<Employee> {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    await this.assertCanReadEmployee(user, employee);
    return employee;
  }

  async create(dto: CreateEmployeeDto): Promise<Employee> {
    await this.settingsService.assertFeatureEnabled('features.employees');
    await this.assertOrgUnitExists(dto.orgUnitId);
    return this.prisma.employee.create({ data: dto });
  }

  async update(id: string, dto: UpdateEmployeeDto): Promise<Employee> {
    await this.settingsService.assertFeatureEnabled('features.employees');
    await this.findByIdOrThrow(id);
    if (dto.orgUnitId) {
      await this.assertOrgUnitExists(dto.orgUnitId);
    }
    return this.prisma.employee.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.findByIdOrThrow(id);
    await this.prisma.employee.delete({ where: { id } });
  }

  private async assertCanReadEmployee(user: AuthenticatedUser, employee: Employee): Promise<void> {
    if (user.role === 'user') {
      if (!user.employeeId || employee.id !== user.employeeId) {
        throw new ForbiddenException('Users can only access their own employee record');
      }
      return;
    }
    if (user.role === 'admin' || user.role === 'skladistar') {
      return;
    }
    if (user.role === 'evidenticar') {
      const allowed = await this.registrarScope.canAccessEmployee(user, employee);
      if (!allowed) {
        throw new ForbiddenException('Employee outside your scope');
      }
    }
  }

  private async findByIdOrThrow(id: string): Promise<Employee> {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return employee;
  }

  private async assertOrgUnitExists(orgUnitId: string): Promise<void> {
    const unit = await this.prisma.orgUnit.findUnique({ where: { id: orgUnitId } });
    if (!unit) {
      throw new NotFoundException('Org unit not found');
    }
  }
}
