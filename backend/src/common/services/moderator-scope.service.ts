import { ForbiddenException, Injectable } from '@nestjs/common';
import type { OrgUnit, UserRole, Warehouse } from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../types/authenticated-user.type';
import { OrgScopeService } from './org-scope.service';
import { PrismaService } from '../../prisma/prisma.service';

const MODERATOR_ASSIGNABLE_ROLES: UserRole[] = [
  'evidenticar',
  'skladistar',
  'popis_koordinator',
  'user',
];

const ALLOWED_ORG_ROOT_TYPES = new Set(['distribucija', 'podrucje', 'podruznica']);

@Injectable()
export class ModeratorScopeService {
  private scopedOrgCache = new Map<string, string[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly orgScopeService: OrgScopeService,
  ) {}

  isSystemAdmin(user: AuthenticatedUser): boolean {
    return user.role === 'admin';
  }

  isModerator(user: AuthenticatedUser): boolean {
    return user.role === 'moderator';
  }

  hasUnscopedAccess(user: AuthenticatedUser): boolean {
    return this.isSystemAdmin(user);
  }

  async resolveModeratorOrgUnitIds(user: AuthenticatedUser): Promise<string[] | null> {
    if (this.hasUnscopedAccess(user)) {
      return null;
    }
    if (!this.isModerator(user)) {
      return null;
    }
    return this.expandModeratorOrgRoots(user.moderatorOrgRoots);
  }

  async expandModeratorOrgRoots(rootIds: string[]): Promise<string[]> {
    if (rootIds.length === 0) {
      return [];
    }
    const cacheKey = rootIds.slice().sort().join(',');
    const cached = this.scopedOrgCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const expanded = await this.orgScopeService.expandOrgUnitIds(rootIds);
    this.scopedOrgCache.set(cacheKey, expanded);
    return expanded;
  }

  async assertOrgUnitInScope(user: AuthenticatedUser, orgUnitId: string): Promise<void> {
    if (!this.isModerator(user)) {
      return;
    }
    const scopedIds = await this.resolveModeratorOrgUnitIds(user);
    if (!scopedIds || scopedIds.length === 0) {
      throw new ForbiddenException('Org jedinica je van vašeg opsega');
    }
    if (!scopedIds.includes(orgUnitId)) {
      throw new ForbiddenException('Org jedinica je van vašeg opsega');
    }
  }

  async assertOrgUnitIsInScope(user: AuthenticatedUser, orgUnitId: string): Promise<void> {
    await this.assertOrgUnitInScope(user, orgUnitId);
  }

  async assertWarehouseInOrgScope(user: AuthenticatedUser, warehouseId: string): Promise<void> {
    if (this.hasUnscopedAccess(user)) {
      return;
    }
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { orgUnitId: true, isActive: true },
    });
    if (!warehouse?.orgUnitId) {
      throw new ForbiddenException('Skladište nema org jedinicu');
    }
    if (!warehouse.isActive && this.isModerator(user)) {
      throw new ForbiddenException('Skladište nije aktivno');
    }
    await this.assertOrgUnitInScope(user, warehouse.orgUnitId);
  }

  canManageInventoryCommittee(user: AuthenticatedUser, warehouseId: string): boolean {
    if (this.isSystemAdmin(user)) {
      return true;
    }
    if (!this.isModerator(user)) {
      return false;
    }
    return user.moderatorWarehouseIds.includes(warehouseId);
  }

  async assertCanManageInventoryCommittee(user: AuthenticatedUser, warehouseId: string): Promise<void> {
    if (this.canManageInventoryCommittee(user, warehouseId)) {
      return;
    }
    throw new ForbiddenException('Skladište je van vašeg opsega za popisne komisije');
  }

  assertCanAssignRole(actor: AuthenticatedUser, targetRole: UserRole): void {
    if (this.isSystemAdmin(actor)) {
      return;
    }
    if (!this.isModerator(actor)) {
      throw new ForbiddenException('Nemate dozvolu za dodjelu uloga');
    }
    if (!MODERATOR_ASSIGNABLE_ROLES.includes(targetRole)) {
      throw new ForbiddenException('Moderator ne može dodijeliti tu ulogu');
    }
  }

  assertCanManagePrivilegedUser(actor: AuthenticatedUser, targetRole: UserRole): void {
    if (this.isSystemAdmin(actor)) {
      return;
    }
    if (targetRole === 'admin' || targetRole === 'moderator') {
      throw new ForbiddenException('Moderator ne može upravljati administratorima ili moderatorima');
    }
  }

  async filterOrgUnitsForUser<T extends Pick<OrgUnit, 'id'>>(user: AuthenticatedUser, units: T[]): Promise<T[]> {
    return this.filterByOrgScope(user, units);
  }

  async filterByOrgScope<T extends { id: string }>(user: AuthenticatedUser, rows: T[]): Promise<T[]> {
    const scopedIds = await this.resolveModeratorOrgUnitIds(user);
    if (scopedIds === null) {
      return rows;
    }
    const allowed = new Set(scopedIds);
    return rows.filter((row) => allowed.has(row.id));
  }

  async buildScopedOrgUnitWhere(user: AuthenticatedUser): Promise<{ id: { in: string[] } } | null> {
    if (!this.isModerator(user)) {
      return null;
    }
    const scopedIds = await this.resolveModeratorOrgUnitIds(user);
    if (!scopedIds || scopedIds.length === 0) {
      return { id: { in: [] } };
    }
    return { id: { in: scopedIds } };
  }

  async buildScopedWarehouseWhere(user: AuthenticatedUser): Promise<{ orgUnitId: { in: string[] } } | null> {
    if (!this.isModerator(user)) {
      return null;
    }
    const scopedIds = await this.resolveModeratorOrgUnitIds(user);
    if (!scopedIds || scopedIds.length === 0) {
      return { orgUnitId: { in: [] } };
    }
    return { orgUnitId: { in: scopedIds } };
  }

  async buildScopedEmployeeWhere(user: AuthenticatedUser): Promise<{ orgUnitId: { in: string[] } } | null> {
    if (!this.isModerator(user)) {
      return null;
    }
    const scopedIds = await this.resolveModeratorOrgUnitIds(user);
    if (!scopedIds || scopedIds.length === 0) {
      return { orgUnitId: { in: [] } };
    }
    return { orgUnitId: { in: scopedIds } };
  }

  async buildEquipmentReadWhere(user: AuthenticatedUser): Promise<object | null> {
    if (!this.isModerator(user)) {
      return null;
    }
    const scopedIds = await this.resolveModeratorOrgUnitIds(user);
    if (!scopedIds || scopedIds.length === 0) {
      return { id: { in: [] } };
    }
    return {
      OR: [
        { warehouse: { orgUnitId: { in: scopedIds } } },
        { currentHolder: { orgUnitId: { in: scopedIds } } },
      ],
    };
  }

  async isUserInModeratorScope(actor: AuthenticatedUser, targetUserId: string): Promise<boolean> {
    if (this.hasUnscopedAccess(actor)) {
      return true;
    }
    if (!this.isModerator(actor)) {
      return false;
    }
    const scopedIds = await this.resolveModeratorOrgUnitIds(actor);
    if (!scopedIds || scopedIds.length === 0) {
      return false;
    }
    const scopedSet = new Set(scopedIds);
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        employee: { select: { orgUnitId: true } },
        registrarAssignments: { select: { warehouseId: true } },
        inventoryCoordinatorAssignments: { select: { warehouseId: true } },
        warehouseAssignments: { select: { warehouseId: true } },
      },
    });
    if (!target) {
      return false;
    }
    if (target.role === 'admin' || target.role === 'moderator') {
      return false;
    }
    if (target.employee && scopedSet.has(target.employee.orgUnitId)) {
      return true;
    }
    const warehouseIds = [
      ...target.registrarAssignments.map((row) => row.warehouseId),
      ...target.inventoryCoordinatorAssignments.map((row) => row.warehouseId),
      ...target.warehouseAssignments.map((row) => row.warehouseId),
    ];
    if (warehouseIds.length === 0) {
      return false;
    }
    const warehouses = await this.prisma.warehouse.findMany({
      where: { id: { in: warehouseIds } },
      select: { orgUnitId: true },
    });
    return warehouses.some((row) => row.orgUnitId && scopedSet.has(row.orgUnitId));
  }

  async assertCanManageTargetUser(actor: AuthenticatedUser, targetUserId: string): Promise<void> {
    if (this.hasUnscopedAccess(actor)) {
      return;
    }
    const allowed = await this.isUserInModeratorScope(actor, targetUserId);
    if (!allowed) {
      throw new ForbiddenException('Korisnik je van vašeg opsega');
    }
  }

  async assertRegistrarScopesInModeratorScope(
    actor: AuthenticatedUser,
    scopes: { warehouseId: string; orgUnitId?: string | null }[],
  ): Promise<void> {
    if (this.hasUnscopedAccess(actor)) {
      return;
    }
    for (const scope of scopes) {
      await this.assertWarehouseInOrgScope(actor, scope.warehouseId);
      if (scope.orgUnitId) {
        await this.assertOrgUnitInScope(actor, scope.orgUnitId);
      }
    }
  }

  async assertCoordinatorAssignmentsInModeratorScope(
    actor: AuthenticatedUser,
    assignments: { warehouseId: string; orgUnitId?: string | null }[],
  ): Promise<void> {
    if (this.hasUnscopedAccess(actor)) {
      return;
    }
    for (const assignment of assignments) {
      await this.assertWarehouseInOrgScope(actor, assignment.warehouseId);
      if (assignment.orgUnitId) {
        await this.assertOrgUnitInScope(actor, assignment.orgUnitId);
      }
    }
  }

  async assertModeratorOrgRootsValid(orgUnitIds: string[]): Promise<void> {
    if (orgUnitIds.length === 0) {
      throw new ForbiddenException('Moderator mora imati barem jednu org jedinicu');
    }
    const units = await this.prisma.orgUnit.findMany({
      where: { id: { in: orgUnitIds } },
      select: { id: true, type: true },
    });
    if (units.length !== orgUnitIds.length) {
      throw new ForbiddenException('Jedna ili više org jedinica ne postoji');
    }
    for (const unit of units) {
      if (!ALLOWED_ORG_ROOT_TYPES.has(unit.type)) {
        throw new ForbiddenException('Org root mora biti distribucija, područje ili podružnica');
      }
    }
  }

  async assertModeratorWarehouseAssignmentsValid(
    orgRootIds: string[],
    warehouseIds: string[],
    excludeUserId?: string,
  ): Promise<void> {
    if (warehouseIds.length === 0) {
      return;
    }
    const expandedOrgIds = await this.expandModeratorOrgRoots(orgRootIds);
    const expandedSet = new Set(expandedOrgIds);
    const warehouses = await this.prisma.warehouse.findMany({
      where: { id: { in: warehouseIds } },
      select: { id: true, orgUnitId: true, isActive: true },
    });
    if (warehouses.length !== warehouseIds.length) {
      throw new ForbiddenException('Jedno ili više skladišta ne postoji');
    }
    for (const warehouse of warehouses) {
      if (!warehouse.orgUnitId || !expandedSet.has(warehouse.orgUnitId)) {
        throw new ForbiddenException('Skladište mora biti u org opsegu moderatora');
      }
      if (!warehouse.isActive) {
        throw new ForbiddenException('Skladište mora biti aktivno');
      }
    }
    const conflicts = await this.prisma.moderatorWarehouseAssignment.findMany({
      where: {
        warehouseId: { in: warehouseIds },
        ...(excludeUserId ? { NOT: { userId: excludeUserId } } : {}),
      },
      select: { warehouseId: true },
    });
    if (conflicts.length > 0) {
      throw new ForbiddenException('Skladište već ima dodijeljenog moderatora');
    }
  }

  async filterWarehousesForUser(user: AuthenticatedUser, warehouses: Warehouse[]): Promise<Warehouse[]> {
    const scopedWhere = await this.buildScopedWarehouseWhere(user);
    if (!scopedWhere) {
      return warehouses;
    }
    const allowed = new Set(scopedWhere.orgUnitId.in);
    return warehouses.filter((row) => row.orgUnitId && allowed.has(row.orgUnitId));
  }
}
