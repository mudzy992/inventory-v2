import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { Prisma, User, UserRole } from '../../../generated/prisma/client';
import type { PaginatedResponse } from '../../common/types/paginated-response.type';
import type { CoordinatorScopeAssignment } from '../../common/types/coordinator-scope.type';
import type { RegistrarScopeAssignment } from '../../common/types/registrar-scope.type';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import { WarehouseResolutionService } from '../../common/services/warehouse-resolution.service';
import {
  buildContainsSearchWhere,
  buildOrderBy,
  paginate,
  parsePagination,
  resolveListPageSize,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { assertEmployeeCanDeactivateOrNotify } from '../employees/utils/employee-deactivation.util';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { assertUserAccessRules, normalizeCoordinatorAssignments, normalizeRegistrarScopes } from './users-validation.util';

export interface UserListItem {
  id: string;
  username: string;
  role: UserRole;
  employeeId: string | null;
  isActive: boolean;
  registrarScopes: RegistrarScopeAssignment[];
  coordinatorAssignments: CoordinatorScopeAssignment[];
  lastLoginAt: string | null;
}

const USER_SORT_FIELDS: Record<string, string> = {
  username: 'username',
  role: 'role',
  createdAt: 'createdAt',
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly registrarScope: RegistrarScopeService,
    private readonly warehouseResolution: WarehouseResolutionService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(query: ListUsersQueryDto): Promise<PaginatedResponse<UserListItem>> {
    const { pageSize, maxPageSize } = await resolveListPageSize(query.pageSize, this.settingsService);
    const { page, take } = parsePagination(query, { defaultPageSize: pageSize, maxPageSize });
    const where = this.buildListWhere(query);
    const orderBy = buildOrderBy(query.sortBy, query.sortDir, USER_SORT_FIELDS, 'username');
    type UserWithAssignments = User & {
      registrarAssignments: {
        warehouseId: string;
        categoryId: string;
        orgUnitId: string | null;
      }[];
      inventoryCoordinatorAssignments: {
        warehouseId: string;
        orgUnitId: string | null;
      }[];
    };
    const result = await paginate<UserWithAssignments, Prisma.UserWhereInput>({
      findMany: async (args) => {
        const rows = await this.prisma.user.findMany({
          ...args,
          include: { registrarAssignments: true, inventoryCoordinatorAssignments: true },
        });
        return rows as UserWithAssignments[];
      },
      count: (args) => this.prisma.user.count(args),
      where,
      orderBy,
      page,
      pageSize: take,
    });
    return {
      items: result.items.map((user) => this.toListItem(user)),
      meta: result.meta,
    };
  }

  async findOne(id: string): Promise<UserListItem> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { registrarAssignments: true, inventoryCoordinatorAssignments: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toListItem(user);
  }

  async create(dto: CreateUserDto): Promise<UserListItem> {
    await this.settingsService.assertFeatureEnabled('features.user_management');
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException('Username already exists');
    }
    const registrarScopes = normalizeRegistrarScopes(dto.role, dto.registrarScopes);
    const coordinatorAssignments = normalizeCoordinatorAssignments(
      dto.role,
      dto.coordinatorAssignments,
    );
    await assertUserAccessRules(this.prisma, {
      role: dto.role,
      employeeId: dto.employeeId,
      registrarScopes,
      coordinatorAssignments,
    });
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username.trim(),
        passwordHash,
        role: dto.role,
        employeeId: dto.employeeId,
        isActive: dto.isActive ?? true,
        registrarAssignments:
          registrarScopes.length > 0
            ? {
                create: registrarScopes.map((scope) => ({
                  warehouseId: scope.warehouseId,
                  categoryId: scope.categoryId,
                  orgUnitId: scope.orgUnitId ?? null,
                })),
              }
            : undefined,
        inventoryCoordinatorAssignments:
          coordinatorAssignments.length > 0
            ? {
                create: coordinatorAssignments.map((scope) => ({
                  warehouseId: scope.warehouseId,
                  orgUnitId: scope.orgUnitId ?? null,
                })),
              }
            : undefined,
      },
      include: { registrarAssignments: true, inventoryCoordinatorAssignments: true },
    });
    return this.toListItem(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserListItem> {
    await this.settingsService.assertFeatureEnabled('features.user_management');
    const current = await this.prisma.user.findUnique({
      where: { id },
      include: { registrarAssignments: true, inventoryCoordinatorAssignments: true },
    });
    if (!current) {
      throw new NotFoundException('User not found');
    }
    const role = dto.role ?? current.role;
    const employeeId = dto.employeeId !== undefined ? dto.employeeId : current.employeeId;
    const registrarScopes =
      dto.registrarScopes !== undefined
        ? normalizeRegistrarScopes(role, dto.registrarScopes)
        : normalizeRegistrarScopes(
            role,
            current.registrarAssignments.map((row) => ({
              warehouseId: row.warehouseId,
              categoryId: row.categoryId,
              orgUnitId: row.orgUnitId,
            })),
          );
    const coordinatorAssignments =
      dto.coordinatorAssignments !== undefined
        ? normalizeCoordinatorAssignments(role, dto.coordinatorAssignments)
        : normalizeCoordinatorAssignments(
            role,
            current.inventoryCoordinatorAssignments.map((row) => ({
              warehouseId: row.warehouseId,
              orgUnitId: row.orgUnitId,
            })),
          );
    await assertUserAccessRules(this.prisma, {
      role,
      employeeId,
      registrarScopes,
      coordinatorAssignments,
      excludeUserId: id,
    });
    const isDeactivatingUser = dto.isActive === false && current.isActive !== false;
    if (isDeactivatingUser && employeeId) {
      const employee = await this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: { firstName: true, lastName: true },
      });
      if (employee) {
        const employeeName = `${employee.firstName} ${employee.lastName}`.trim();
        await assertEmployeeCanDeactivateOrNotify(
          {
            prisma: this.prisma,
            registrarScope: this.registrarScope,
            warehouseResolution: this.warehouseResolution,
            notifications: this.notifications,
          },
          employeeId,
          employeeName,
        );
      }
    }
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 10) : undefined;
    await this.prisma.registrarAssignment.deleteMany({ where: { userId: id } });
    await this.prisma.inventoryCoordinatorAssignment.deleteMany({ where: { userId: id } });
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          role: dto.role,
          employeeId: dto.employeeId,
          isActive: dto.isActive,
          registrarAssignments:
            registrarScopes.length > 0
              ? {
                  create: registrarScopes.map((scope) => ({
                    warehouseId: scope.warehouseId,
                    categoryId: scope.categoryId,
                    orgUnitId: scope.orgUnitId ?? null,
                  })),
                }
              : undefined,
          inventoryCoordinatorAssignments:
            coordinatorAssignments.length > 0
              ? {
                  create: coordinatorAssignments.map((scope) => ({
                    warehouseId: scope.warehouseId,
                    orgUnitId: scope.orgUnitId ?? null,
                  })),
                }
              : undefined,
        },
        include: { registrarAssignments: true, inventoryCoordinatorAssignments: true },
      });
      if (isDeactivatingUser && employeeId) {
        await tx.employee.update({
          where: { id: employeeId },
          data: { isActive: false },
        });
      }
      return updated;
    });
    return this.toListItem(user);
  }

  private buildListWhere(query: ListUsersQueryDto): Prisma.UserWhereInput {
    const searchWhere = buildContainsSearchWhere(query.search, ['username']);
    return searchWhere ?? {};
  }

  private toListItem(
    user: User & {
      registrarAssignments: {
        warehouseId: string;
        categoryId: string;
        orgUnitId: string | null;
      }[];
      inventoryCoordinatorAssignments: {
        warehouseId: string;
        orgUnitId: string | null;
      }[];
    },
  ): UserListItem {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.employeeId,
      isActive: user.isActive,
      registrarScopes: user.registrarAssignments.map((row) => ({
        warehouseId: row.warehouseId,
        categoryId: row.categoryId,
        orgUnitId: row.orgUnitId,
      })),
      coordinatorAssignments: user.inventoryCoordinatorAssignments.map((row) => ({
        warehouseId: row.warehouseId,
        orgUnitId: row.orgUnitId,
      })),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }
}
