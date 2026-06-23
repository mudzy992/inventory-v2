import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Employee, Prisma } from '../../../generated/prisma/client';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import { ModeratorScopeService } from '../../common/services/moderator-scope.service';
import { WarehouseResolutionService } from '../../common/services/warehouse-resolution.service';
import type { PaginatedResponse } from '../../common/types/paginated-response.type';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { EMPLOYEE_MESSAGES } from '../../common/utils/employee-messages.util';
import { AUTOCOMPLETE_SEARCH_LIMIT } from '../../common/dto/autocomplete-search-query.dto';
import { parseCategoryFields, resolveSerialNumberFromSpecifications } from '../../common/utils/category-fields.util';
import {
  buildContainsSearchWhere,
  buildOrderBy,
  paginate,
  parsePagination,
  resolveListPageSize,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { EmployeeRelocationService } from '../employee-relocation/employee-relocation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { SearchEmployeesQueryDto } from './dto/search-employees-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { assertEmployeeCanDeactivateOrNotify } from './utils/employee-deactivation.util';

const EMPLOYEE_SORT_FIELDS: Record<string, string> = {
  lastName: 'lastName',
  firstName: 'firstName',
  email: 'email',
  createdAt: 'createdAt',
};

const EMPLOYEE_LIST_INCLUDE = {
  user: { select: { id: true } },
  _count: {
    select: {
      heldEquipment: { where: { status: 'zaduzeno' as const } },
      signedTransfers: true,
      signingOrgUnits: true,
      relocationCases: { where: { status: 'open' as const } },
    },
  },
} as const;

export type EmployeeListItem = Employee & {
  heldEquipmentCount: number;
  hasUserAccount: boolean;
  isOrgSigner: boolean;
  signedTransferCount: number;
  openRelocationCount: number;
};

export interface EmployeeProfileHeldEquipment {
  id: string;
  inventoryNumber: string | null;
  categoryName: string;
  lotName: string | null;
  serialNumber: string | null;
  status: string;
}

export interface EmployeeProfileUser {
  id: string;
  email: string;
  role: string;
}

export interface EmployeeProfile {
  employee: EmployeeListItem;
  user: EmployeeProfileUser | null;
  heldEquipment: EmployeeProfileHeldEquipment[];
  heldEquipmentTotal: number;
}

export interface EmployeeUpdateResult extends Employee {
  userDeactivated?: boolean;
  linkedUserRole?: string;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registrarScope: RegistrarScopeService,
    private readonly moderatorScope: ModeratorScopeService,
    private readonly warehouseResolution: WarehouseResolutionService,
    private readonly settingsService: SettingsService,
    private readonly employeeRelocationService: EmployeeRelocationService,
    private readonly notifications: NotificationsService,
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
          include: EMPLOYEE_LIST_INCLUDE,
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
      'staffNumber',
    ]);
    const filters: Prisma.EmployeeWhereInput[] = [scopeWhere];
    if (query.activeOnly !== false) {
      filters.push({ isActive: true });
    }
    if (searchWhere) {
      filters.push(searchWhere);
    }
    const where: Prisma.EmployeeWhereInput = filters.length === 1 ? filters[0]! : { AND: filters };
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

  async getProfile(user: AuthenticatedUser, id: string): Promise<EmployeeProfile> {
    await this.settingsService.assertFeatureEnabled('features.employees');
    const row = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, role: true } },
        _count: {
          select: {
            heldEquipment: { where: { status: 'zaduzeno' as const } },
            signedTransfers: true,
            signingOrgUnits: true,
            relocationCases: { where: { status: 'open' as const } },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Employee not found');
    }
    await this.assertCanReadEmployee(user, row);
    const [heldEquipment, heldEquipmentTotal] = await Promise.all([
      this.prisma.equipment.findMany({
        where: { currentHolderId: id, status: 'zaduzeno' },
        orderBy: { inventoryNumber: 'asc' },
        take: 50,
        select: {
          id: true,
          inventoryNumber: true,
          status: true,
          specifications: true,
          category: { select: { name: true, fields: true, optionalFields: true } },
          stockLot: { select: { productName: true } },
        },
      }),
      this.prisma.equipment.count({
        where: { currentHolderId: id, status: 'zaduzeno' },
      }),
    ]);
    const { user: linkedUser, _count, ...employee } = row;
    return {
      employee: {
        ...employee,
        heldEquipmentCount: _count.heldEquipment,
        hasUserAccount: Boolean(linkedUser),
        isOrgSigner: _count.signingOrgUnits > 0,
        signedTransferCount: _count.signedTransfers,
        openRelocationCount: _count.relocationCases,
      },
      user: linkedUser
        ? { id: linkedUser.id, email: linkedUser.email ?? '', role: linkedUser.role }
        : null,
      heldEquipment: heldEquipment.map((item) => {
        const fields = parseCategoryFields(item.category.fields);
        const optionalFields = parseCategoryFields(item.category.optionalFields);
        const specifications = (item.specifications ?? {}) as Record<string, string>;
        return {
          id: item.id,
          inventoryNumber: item.inventoryNumber,
          categoryName: item.category.name,
          lotName: item.stockLot?.productName?.trim() || null,
          serialNumber: resolveSerialNumberFromSpecifications(
            fields,
            optionalFields,
            specifications,
          ),
          status: item.status,
        };
      }),
      heldEquipmentTotal,
    };
  }

  async create(user: AuthenticatedUser, dto: CreateEmployeeDto): Promise<Employee> {
    await this.assertCanCreateEmployee(user, dto.orgUnitId);
    const staffNumber = this.normalizeStaffNumber(dto.staffNumber);
    if (staffNumber) {
      await this.assertStaffNumberAvailable(staffNumber);
    }
    try {
      return await this.prisma.employee.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          title: dto.title,
          orgUnitId: dto.orgUnitId,
          staffNumber,
          gender: dto.gender ?? 'male',
          isActive: dto.isActive ?? true,
          email: dto.email,
          phone: dto.phone,
        },
      });
    } catch (err) {
      this.rethrowStaffNumberConflict(err);
      throw err;
    }
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateEmployeeDto,
  ): Promise<EmployeeUpdateResult> {
    const existing = await this.findByIdOrThrow(id);
    await this.assertCanUpdateEmployee(user, existing, dto);
    const staffNumber =
      dto.staffNumber !== undefined ? this.normalizeStaffNumber(dto.staffNumber) : undefined;
    if (staffNumber) {
      await this.assertStaffNumberAvailable(staffNumber, id);
    }
    const isDeactivating = existing.isActive && dto.isActive === false;
    if (isDeactivating) {
      const employeeName = `${existing.firstName} ${existing.lastName}`.trim();
      await assertEmployeeCanDeactivateOrNotify(
        {
          prisma: this.prisma,
          registrarScope: this.registrarScope,
          warehouseResolution: this.warehouseResolution,
          notifications: this.notifications,
        },
        id,
        employeeName,
      );
    }
    const linkedUser = isDeactivating
      ? await this.prisma.user.findFirst({
          where: { employeeId: id },
          select: { id: true, role: true },
        })
      : null;
    const updatePayload: Prisma.EmployeeUpdateInput = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      title: dto.title,
      staffNumber,
      gender: dto.gender,
      isActive: dto.isActive,
      email: dto.email,
      phone: dto.phone,
    };
    if (dto.orgUnitId) {
      updatePayload.orgUnit = { connect: { id: dto.orgUnitId } };
    }
    let updated: Employee;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const employee = await tx.employee.update({ where: { id }, data: updatePayload });
        if (isDeactivating && linkedUser) {
          await tx.user.update({ where: { id: linkedUser.id }, data: { isActive: false } });
        }
        return employee;
      });
    } catch (err) {
      this.rethrowStaffNumberConflict(err);
      throw err;
    }
    if (dto.orgUnitId && dto.orgUnitId !== existing.orgUnitId) {
      await this.employeeRelocationService.handleOrgUnitChange(
        id,
        existing.orgUnitId,
        dto.orgUnitId,
        user.id,
      );
    }
    if (isDeactivating && linkedUser) {
      return {
        ...updated,
        userDeactivated: true,
        linkedUserRole: linkedUser.role,
      };
    }
    return updated;
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    await this.assertModeratorWrites(user);
    const employee = await this.findByIdOrThrow(id);
    await this.moderatorScope.assertOrgUnitInScope(user, employee.orgUnitId);
    const [linkedUser, heldEquipment, signedTransfers, orgSigner, openRelocation] = await Promise.all([
      this.prisma.user.findFirst({ where: { employeeId: id }, select: { id: true } }),
      this.prisma.equipment.count({ where: { currentHolderId: id, status: 'zaduzeno' } }),
      this.prisma.transfer.count({ where: { signerId: id } }),
      this.prisma.orgUnit.count({ where: { signerId: id } }),
      this.prisma.employeeRelocationCase.count({
        where: { employeeId: id, status: 'open' },
      }),
    ]);
    if (linkedUser) {
      throw new BadRequestException(EMPLOYEE_MESSAGES.deleteHasUserAccount);
    }
    if (orgSigner > 0) {
      throw new BadRequestException(EMPLOYEE_MESSAGES.deleteIsOrgSigner);
    }
    if (signedTransfers > 0) {
      throw new BadRequestException(EMPLOYEE_MESSAGES.deleteHasSignedTransfers);
    }
    if (heldEquipment > 0) {
      throw new BadRequestException(EMPLOYEE_MESSAGES.deleteHasHeldEquipment);
    }
    if (openRelocation > 0) {
      throw new BadRequestException(EMPLOYEE_MESSAGES.deleteHasOpenRelocation);
    }
    await this.prisma.employee.delete({ where: { id } });
  }

  private async buildListWhere(
    user: AuthenticatedUser,
    query: ListEmployeesQueryDto,
  ): Promise<Prisma.EmployeeWhereInput> {
    const scopeWhere = this.moderatorScope.isModerator(user)
      ? ((await this.moderatorScope.buildScopedEmployeeWhere(user)) ?? {})
      : await this.registrarScope.buildEmployeeWhere(user);
    const filters: Prisma.EmployeeWhereInput[] = [scopeWhere];
    if (query.orgUnitId) {
      filters.push({ orgUnitId: query.orgUnitId });
    }
    if (query.withoutUserAccount) {
      if (user.role !== 'admin' && !this.moderatorScope.isModerator(user)) {
        throw new ForbiddenException('Only administrators can list employees without user accounts');
      }
      filters.push({ user: { is: null } });
    }
    if (query.isActive !== undefined) {
      filters.push({ isActive: query.isActive });
    }
    const searchWhere = buildContainsSearchWhere(query.search, [
      'firstName',
      'lastName',
      'email',
      'staffNumber',
    ]);
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
    if (this.moderatorScope.isModerator(user)) {
      await this.moderatorScope.assertOrgUnitInScope(user, employee.orgUnitId);
      return;
    }
    if (user.role === 'evidenticar') {
      const allowed = await this.registrarScope.canAccessEmployee(user, employee);
      if (!allowed) {
        throw new ForbiddenException('Employee outside your scope');
      }
    }
  }

  private async assertCanCreateEmployee(user: AuthenticatedUser, orgUnitId: string): Promise<void> {
    await this.settingsService.assertFeatureEnabled('features.employees');
    await this.assertOrgUnitExists(orgUnitId);
    if (user.role === 'admin') {
      return;
    }
    if (this.moderatorScope.isModerator(user)) {
      await this.assertModeratorWrites(user);
      await this.moderatorScope.assertOrgUnitInScope(user, orgUnitId);
      return;
    }
    if (user.role === 'evidenticar') {
      await this.assertRegistrarEmployeeWrites(user);
      await this.registrarScope.assertCanAccessEmployee(user, { id: '', orgUnitId });
      return;
    }
    throw new ForbiddenException('Nemate dozvolu za kreiranje radnika');
  }

  private async assertCanUpdateEmployee(
    user: AuthenticatedUser,
    existing: Employee,
    dto: UpdateEmployeeDto,
  ): Promise<void> {
    await this.settingsService.assertFeatureEnabled('features.employees');
    if (user.role === 'admin') {
      if (dto.orgUnitId) {
        await this.assertOrgUnitExists(dto.orgUnitId);
      }
      return;
    }
    if (this.moderatorScope.isModerator(user)) {
      await this.assertModeratorWrites(user);
      await this.moderatorScope.assertOrgUnitInScope(user, existing.orgUnitId);
      if (dto.orgUnitId) {
        await this.assertOrgUnitExists(dto.orgUnitId);
        await this.moderatorScope.assertOrgUnitInScope(user, dto.orgUnitId);
      }
      return;
    }
    if (user.role === 'evidenticar') {
      await this.assertRegistrarEmployeeWrites(user);
      await this.registrarScope.assertCanAccessEmployee(user, existing);
      if (dto.orgUnitId) {
        await this.assertOrgUnitExists(dto.orgUnitId);
      }
      return;
    }
    throw new ForbiddenException('Nemate dozvolu za izmjenu radnika');
  }

  private async assertRegistrarEmployeeWrites(user: AuthenticatedUser): Promise<void> {
    if (user.role !== 'evidenticar') {
      return;
    }
    await this.settingsService.assertFeatureEnabled(
      'features.evidenticar_employee_ops',
      'Upravljanje radnicima za evidentičara je onemogućeno u postavkama',
    );
  }

  private async assertModeratorWrites(user: AuthenticatedUser): Promise<void> {
    if (this.moderatorScope.isModerator(user)) {
      await this.settingsService.assertFeatureEnabled(
        'features.moderator_role',
        'Uloga moderatora je onemogućena u postavkama',
      );
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

  private normalizeStaffNumber(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private async assertStaffNumberAvailable(staffNumber: string, excludeEmployeeId?: string): Promise<void> {
    const existing = await this.prisma.employee.findFirst({
      where: {
        staffNumber,
        ...(excludeEmployeeId ? { id: { not: excludeEmployeeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Staff number already exists');
    }
  }

  private rethrowStaffNumberConflict(err: unknown): void {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      throw new ConflictException('Staff number already exists');
    }
  }

  private toListItem(
    row: Employee & {
      user: { id: string } | null;
      _count: {
        heldEquipment: number;
        signedTransfers: number;
        signingOrgUnits: number;
        relocationCases: number;
      };
    },
  ): EmployeeListItem {
    const { _count, user, ...employee } = row;
    return {
      ...employee,
      heldEquipmentCount: _count.heldEquipment,
      hasUserAccount: Boolean(user),
      isOrgSigner: _count.signingOrgUnits > 0,
      signedTransferCount: _count.signedTransfers,
      openRelocationCount: _count.relocationCases,
    };
  }
}
