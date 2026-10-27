import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { Prisma, User, UserRole } from '../../../generated/prisma/client';
import { ModeratorScopeService } from '../../common/services/moderator-scope.service';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import { WarehouseResolutionService } from '../../common/services/warehouse-resolution.service';
import type { CoordinatorScopeAssignment } from '../../common/types/coordinator-scope.type';
import type { ModeratorOrgAssignment } from '../../common/types/moderator-scope.type';
import type { ModeratorWarehouseAssignment } from '../../common/types/moderator-scope.type';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import type { PaginatedResponse } from '../../common/types/paginated-response.type';
import type { RegistrarScopeAssignment } from '../../common/types/registrar-scope.type';
import {
  buildContainsSearchWhere,
  buildOrderBy,
  paginate,
  parsePagination,
  resolveListPageSize,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  prepareUserSessionRevocation,
  revokeRefreshTokensInTransaction,
  sweepRefreshTokensAfterCommit,
} from '../auth/auth-session-revocation.util';
import { assertEmployeeCanDeactivateOrNotify } from '../employees/utils/employee-deactivation.util';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  assertUserAccessRules,
  normalizeCoordinatorAssignments,
  normalizeModeratorOrgAssignments,
  normalizeModeratorWarehouseAssignments,
  normalizeRegistrarScopes,
} from './users-validation.util';

export interface UserListItem {
  id: string;
  username: string;
  role: UserRole;
  employeeId: string | null;
  isActive: boolean;
  registrarScopes: RegistrarScopeAssignment[];
  coordinatorAssignments: CoordinatorScopeAssignment[];
  moderatorOrgAssignments: ModeratorOrgAssignment[];
  moderatorWarehouseAssignments: ModeratorWarehouseAssignment[];
  lastLoginAt: string | null;
}

const USER_SORT_FIELDS: Record<string, string> = {
  username: 'username',
  role: 'role',
  createdAt: 'createdAt',
};

const userInclude = {
  registrarAssignments: true,
  inventoryCoordinatorAssignments: true,
  moderatorOrgAssignments: true,
  moderatorWarehouseAssignments: true,
} as const;

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
  moderatorOrgAssignments: { orgUnitId: string }[];
  moderatorWarehouseAssignments: { warehouseId: string }[];
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly registrarScope: RegistrarScopeService,
    private readonly moderatorScope: ModeratorScopeService,
    private readonly warehouseResolution: WarehouseResolutionService,
    private readonly notifications: NotificationsService,
    private readonly redisService: RedisService,
  ) {}

  async findAll(
    actor: AuthenticatedUser,
    query: ListUsersQueryDto,
  ): Promise<PaginatedResponse<UserListItem>> {
    await this.assertModeratorActorCanWrite(actor);
    const { pageSize, maxPageSize } = await resolveListPageSize(query.pageSize, this.settingsService);
    const { page, take } = parsePagination(query, { defaultPageSize: pageSize, maxPageSize });
    const where = await this.buildListWhere(actor, query);
    const orderBy = buildOrderBy(query.sortBy, query.sortDir, USER_SORT_FIELDS, 'username');
    const result = await paginate<UserWithAssignments, Prisma.UserWhereInput>({
      findMany: async (args) => {
        const rows = await this.prisma.user.findMany({
          ...args,
          include: userInclude,
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

  async findOne(actor: AuthenticatedUser, id: string): Promise<UserListItem> {
    await this.assertModeratorActorCanWrite(actor);
    await this.moderatorScope.assertCanManageTargetUser(actor, id);
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userInclude,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toListItem(user);
  }

  async create(actor: AuthenticatedUser, dto: CreateUserDto): Promise<UserListItem> {
    await this.assertModeratorActorCanWrite(actor);
    this.moderatorScope.assertCanAssignRole(actor, dto.role);
    if (dto.role === 'moderator' && !this.moderatorScope.isSystemAdmin(actor)) {
      throw new ForbiddenException('Samo administrator može kreirati moderatora');
    }
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException('Username already exists');
    }
    const registrarScopes = normalizeRegistrarScopes(dto.role, dto.registrarScopes);
    const coordinatorAssignments = normalizeCoordinatorAssignments(
      dto.role,
      dto.coordinatorAssignments,
    );
    const moderatorOrgAssignments = normalizeModeratorOrgAssignments(
      dto.role,
      dto.moderatorOrgAssignments,
    );
    const moderatorWarehouseAssignments = normalizeModeratorWarehouseAssignments(
      dto.role,
      dto.moderatorWarehouseAssignments,
    );
    await this.assertScopedAssignments(actor, registrarScopes, coordinatorAssignments);
    await assertUserAccessRules(
      this.prisma,
      {
        role: dto.role,
        employeeId: dto.employeeId,
        registrarScopes,
        coordinatorAssignments,
        moderatorOrgAssignments,
        moderatorWarehouseAssignments,
      },
      this.moderatorScope,
    );
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
        moderatorOrgAssignments:
          moderatorOrgAssignments.length > 0
            ? {
                create: moderatorOrgAssignments.map((scope) => ({
                  orgUnitId: scope.orgUnitId,
                })),
              }
            : undefined,
        moderatorWarehouseAssignments:
          moderatorWarehouseAssignments.length > 0
            ? {
                create: moderatorWarehouseAssignments.map((scope) => ({
                  warehouseId: scope.warehouseId,
                })),
              }
            : undefined,
      },
      include: userInclude,
    });
    return this.toListItem(user);
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateUserDto): Promise<UserListItem> {
    await this.assertModeratorActorCanWrite(actor);
    await this.moderatorScope.assertCanManageTargetUser(actor, id);
    const current = await this.prisma.user.findUnique({
      where: { id },
      include: userInclude,
    });
    if (!current) {
      throw new NotFoundException('User not found');
    }
    this.moderatorScope.assertCanManagePrivilegedUser(actor, current.role);
    const role = dto.role ?? current.role;
    this.moderatorScope.assertCanAssignRole(actor, role);
    if (role === 'moderator' && !this.moderatorScope.isSystemAdmin(actor)) {
      throw new ForbiddenException('Samo administrator može dodijeliti ulogu moderatora');
    }
    if (dto.moderatorOrgAssignments !== undefined && !this.moderatorScope.isSystemAdmin(actor)) {
      throw new ForbiddenException('Samo administrator može mijenjati org dodjele moderatora');
    }
    if (dto.moderatorWarehouseAssignments !== undefined && !this.moderatorScope.isSystemAdmin(actor)) {
      throw new ForbiddenException('Samo administrator može mijenjati skladišne dodjele moderatora');
    }
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
    const moderatorOrgAssignments =
      dto.moderatorOrgAssignments !== undefined
        ? normalizeModeratorOrgAssignments(role, dto.moderatorOrgAssignments)
        : normalizeModeratorOrgAssignments(
            role,
            current.moderatorOrgAssignments.map((row) => ({ orgUnitId: row.orgUnitId })),
          );
    const moderatorWarehouseAssignments =
      dto.moderatorWarehouseAssignments !== undefined
        ? normalizeModeratorWarehouseAssignments(role, dto.moderatorWarehouseAssignments)
        : normalizeModeratorWarehouseAssignments(
            role,
            current.moderatorWarehouseAssignments.map((row) => ({ warehouseId: row.warehouseId })),
          );
    await this.assertScopedAssignments(actor, registrarScopes, coordinatorAssignments);
    await assertUserAccessRules(
      this.prisma,
      {
        role,
        employeeId,
        registrarScopes,
        coordinatorAssignments,
        moderatorOrgAssignments,
        moderatorWarehouseAssignments,
        excludeUserId: id,
      },
      this.moderatorScope,
    );
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
    // Write the revocation marker BEFORE the transaction: no post-commit
    // window where a cached identity stays valid, and a Redis failure aborts
    // the update instead of silently leaving a live session behind.
    await prepareUserSessionRevocation(
      this.redisService.getClient(),
      id,
      isDeactivatingUser ? 'user_deactivated' : 'user_updated',
    );
    const deactivationAt = new Date();
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.registrarAssignment.deleteMany({ where: { userId: id } });
      await tx.inventoryCoordinatorAssignment.deleteMany({ where: { userId: id } });
      await tx.moderatorOrgAssignment.deleteMany({ where: { userId: id } });
      await tx.moderatorWarehouseAssignment.deleteMany({ where: { userId: id } });

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
          moderatorOrgAssignments:
            moderatorOrgAssignments.length > 0
              ? {
                  create: moderatorOrgAssignments.map((scope) => ({
                    orgUnitId: scope.orgUnitId,
                  })),
                }
              : undefined,
          moderatorWarehouseAssignments:
            moderatorWarehouseAssignments.length > 0
              ? {
                  create: moderatorWarehouseAssignments.map((scope) => ({
                    warehouseId: scope.warehouseId,
                  })),
                }
              : undefined,
        },
        include: userInclude,
      });
      if (isDeactivatingUser) {
        // Same transaction as user.update(): a deactivated account must not
        // keep usable refresh tokens in the database.
        await revokeRefreshTokensInTransaction(tx, id, deactivationAt);
      }
      if (isDeactivatingUser && employeeId) {
        await tx.employee.update({
          where: { id: employeeId },
          data: { isActive: false },
        });
      }
      return updated;
    });
    if (isDeactivatingUser) {
      // Catch refresh tokens created by a refresh() that raced this commit.
      await sweepRefreshTokensAfterCommit(this.prisma, id, new Date());
      this.notifications.disconnectUserSockets(id);
    }
    return this.toListItem(user);
  }

  private async assertModeratorActorCanWrite(actor: AuthenticatedUser): Promise<void> {
    if (this.moderatorScope.isModerator(actor)) {
      await this.settingsService.assertFeatureEnabled(
        'features.moderator_role',
        'Uloga moderatora je onemogućena u postavkama',
      );
    }
  }

  private async assertScopedAssignments(
    actor: AuthenticatedUser,
    registrarScopes: RegistrarScopeAssignment[],
    coordinatorAssignments: CoordinatorScopeAssignment[],
  ): Promise<void> {
    await this.moderatorScope.assertRegistrarScopesInModeratorScope(actor, registrarScopes);
    await this.moderatorScope.assertCoordinatorAssignmentsInModeratorScope(actor, coordinatorAssignments);
  }

  private async buildListWhere(
    actor: AuthenticatedUser,
    query: ListUsersQueryDto,
  ): Promise<Prisma.UserWhereInput> {
    const searchWhere = buildContainsSearchWhere(query.search, ['username']);
    if (this.moderatorScope.hasUnscopedAccess(actor)) {
      return searchWhere ?? {};
    }
    const scopedOrgIds = await this.moderatorScope.resolveModeratorOrgUnitIds(actor);
    if (!scopedOrgIds || scopedOrgIds.length === 0) {
      return { id: { in: [] } };
    }
    const warehouses = await this.prisma.warehouse.findMany({
      where: { orgUnitId: { in: scopedOrgIds } },
      select: { id: true },
    });
    const warehouseIds = warehouses.map((row) => row.id);
    const scopedWhere: Prisma.UserWhereInput = {
      role: { notIn: ['admin', 'moderator'] },
      OR: [
        { employee: { orgUnitId: { in: scopedOrgIds } } },
        { registrarAssignments: { some: { warehouseId: { in: warehouseIds } } } },
        { inventoryCoordinatorAssignments: { some: { warehouseId: { in: warehouseIds } } } },
        { warehouseAssignments: { some: { warehouseId: { in: warehouseIds } } } },
      ],
    };
    if (!searchWhere) {
      return scopedWhere;
    }
    return { AND: [searchWhere, scopedWhere] };
  }

  private toListItem(user: UserWithAssignments): UserListItem {
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
      moderatorOrgAssignments: user.moderatorOrgAssignments.map((row) => ({
        orgUnitId: row.orgUnitId,
      })),
      moderatorWarehouseAssignments: user.moderatorWarehouseAssignments.map((row) => ({
        warehouseId: row.warehouseId,
      })),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }
}
