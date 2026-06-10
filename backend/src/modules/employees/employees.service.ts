import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Employee, Prisma } from '../../../generated/prisma/client';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import type { PaginatedResponse } from '../../common/types/paginated-response.type';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { AUTOCOMPLETE_SEARCH_LIMIT } from '../../common/dto/autocomplete-search-query.dto';
import {
  buildContainsSearchWhere,
  buildOrderBy,
  paginate,
  parsePagination,
  resolveListPageSize,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { EmployeeRelocationService } from '../employee-relocation/employee-relocation.service';
import { SettingsService } from '../settings/settings.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { SearchEmployeesQueryDto } from './dto/search-employees-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

const EMPLOYEE_SORT_FIELDS: Record<string, string> = {
  lastName: 'lastName',
  firstName: 'firstName',
  email: 'email',
  createdAt: 'createdAt',
};

const HELD_EQUIPMENT_COUNT_SELECT = {
  heldEquipment: { where: { status: 'zaduzeno' as const } },
} as const;

export type EmployeeListItem = Employee & { heldEquipmentCount: number };

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registrarScope: RegistrarScopeService,
    private readonly settingsService: SettingsService,
    private readonly employeeRelocationService: EmployeeRelocationService,
  ) {}

  async findAll(
    user: AuthenticatedUser,
    query: ListEmployeesQueryDto,
  ): Promise<PaginatedResponse<EmployeeListItem>> {
    const { pageSize, maxPageSize } = await resolveListPageSize(query.pageSize, this.settingsService);
    const { page, take } = parsePagination(query, { defaultPageSize: pageSize, maxPageSize });
    const where = await this.buildListWhere(user, query);
    const orderBy = buildOrderBy(query.sortBy, query.sortDir, EMPLOYEE_SORT_FIELDS, 'lastName');
    const result = await paginate({
      findMany: (args) =>
        this.prisma.employee.findMany({
          ...args,
          orderBy: [orderBy, { firstName: 'asc' }],
          include: { _count: { select: HELD_EQUIPMENT_COUNT_SELECT } },
        }),
      count: (args) => this.prisma.employee.count(args),
      where,
      orderBy,
      page,
      pageSize: take,
    });
    return {
      items: result.items.map((row) => this.toListItem(row)),
      meta: result.meta,
    };
  }

  async search(user: AuthenticatedUser, query: SearchEmployeesQueryDto): Promise<Employee[]> {
    const term = query.q.trim();
    const limit = Math.min(query.limit ?? AUTOCOMPLETE_SEARCH_LIMIT, AUTOCOMPLETE_SEARCH_LIMIT);
    const scopeWhere = await this.registrarScope.buildEmployeeWhere(user);
    const searchWhere = buildContainsSearchWhere(term, [
      'firstName',
      'lastName',
      'email',
      'title',
    ]);
    const where: Prisma.EmployeeWhereInput = searchWhere
      ? { AND: [scopeWhere, searchWhere] }
      : scopeWhere;
    return this.prisma.employee.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: limit,
    });
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

  async update(
    id: string,
    dto: UpdateEmployeeDto,
    actorUserId?: string,
  ): Promise<Employee> {
    await this.settingsService.assertFeatureEnabled('features.employees');
    const existing = await this.findByIdOrThrow(id);
    if (dto.orgUnitId) {
      await this.assertOrgUnitExists(dto.orgUnitId);
    }
    const updated = await this.prisma.employee.update({ where: { id }, data: dto });
    if (dto.orgUnitId && dto.orgUnitId !== existing.orgUnitId && actorUserId) {
      await this.employeeRelocationService.handleOrgUnitChange(
        id,
        existing.orgUnitId,
        dto.orgUnitId,
        actorUserId,
      );
    }
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.findByIdOrThrow(id);
    await this.prisma.employee.delete({ where: { id } });
  }

  private async buildListWhere(
    user: AuthenticatedUser,
    query: ListEmployeesQueryDto,
  ): Promise<Prisma.EmployeeWhereInput> {
    const scopeWhere = await this.registrarScope.buildEmployeeWhere(user);
    const filters: Prisma.EmployeeWhereInput[] = [scopeWhere];
    if (query.orgUnitId) {
      filters.push({ orgUnitId: query.orgUnitId });
    }
    if (query.withoutUserAccount) {
      if (user.role !== 'admin') {
        throw new ForbiddenException('Only administrators can list employees without user accounts');
      }
      filters.push({ user: { is: null } });
    }
    const searchWhere = buildContainsSearchWhere(query.search, ['firstName', 'lastName', 'email']);
    if (searchWhere) {
      filters.push(searchWhere);
    }
    return filters.length === 1 ? filters[0]! : { AND: filters };
  }

  private async assertCanReadEmployee(user: AuthenticatedUser, employee: Employee): Promise<void> {
    if (user.employeeId && employee.id === user.employeeId) {
      return;
    }
    if (user.role === 'user') {
      throw new ForbiddenException('Users can only access their own employee record');
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

  private toListItem(
    row: Employee & { _count: { heldEquipment: number } },
  ): EmployeeListItem {
    const { _count, ...employee } = row;
    return {
      ...employee,
      heldEquipmentCount: _count.heldEquipment,
    };
  }
}
