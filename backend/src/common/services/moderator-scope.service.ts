import { ForbiddenException, Injectable } from '@nestjs/common';
import type { OrgUnit, UserRole, Warehouse } from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../types/authenticated-user.type';
import { isEquipmentHeldByUser, isSelfEmployeeId } from '../utils/self-profile-access.util';
import { isModeratorAssignableOrgType } from '../utils/moderator-org-types.util';
import { OrgScopeService } from './org-scope.service';
import { WarehouseResolutionService } from './warehouse-resolution.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  getScopeCacheVersion,
  isScopeCacheStale,
} from './scope-cache.registry';

const MODERATOR_ASSIGNABLE_ROLES: UserRole[] = [
  'evidenticar',
  'skladistar',
  'popis_koordinator',
  'user',
];

@Injectable()
export class ModeratorScopeService {
  private scopedOrgCache = new Map<string, string[]>();
  private cacheLoadedAt = 0;
  private cacheVersion = -1;

  private refreshCacheIfStale(): void {
    if (!isScopeCacheStale(this.cacheLoadedAt, this.cacheVersion)) return;
    this.scopedOrgCache.clear();
    this.cacheLoadedAt = Date.now();
    this.cacheVersion = getScopeCacheVersion();
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly orgScopeService: OrgScopeService,
    private readonly warehouseResolution: WarehouseResolutionService,
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
    this.refreshCacheIfStale();
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
    if (await this.isSelfEmployeeOrgUnit(user, orgUnitId)) {
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

  async assertWarehouseAssigned(user: AuthenticatedUser, warehouseId: string): Promise<void> {
    if (this.hasUnscopedAccess(user)) {
      return;
    }
    if (!this.isModerator(user)) {
      throw new ForbiddenException('Nemate dozvolu za ovu operaciju na skladištu');
    }
    if (!user.moderatorWarehouseIds.includes(warehouseId)) {
      throw new ForbiddenException('Skladište nije u vašoj dodjeli');
    }
    await this.assertWarehouseInOrgScope(user, warehouseId);
  }

  isWarehouseAssigned(user: AuthenticatedUser, warehouseId: string): boolean {
    if (this.hasUnscopedAccess(user)) {
      return true;
    }
    if (!this.isModerator(user)) {
      return false;
    }
    return user.moderatorWarehouseIds.includes(warehouseId);
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

  async buildEquipmentScopeWhere(user: AuthenticatedUser): Promise<object | null> {
    const operational = await this.buildOperationalEquipmentScopeWhere(user);
    if (!this.isModerator(user) || !user.employeeId) {
      return operational;
    }
    return { OR: [operational, { currentHolderId: user.employeeId }] };
  }

  async buildOperationalEquipmentScopeWhere(user: AuthenticatedUser): Promise<object | null> {
    if (!this.isModerator(user)) {
      return null;
    }
    const scopedIds = await this.resolveModeratorOrgUnitIds(user);
    const assignedWarehouseIds = user.moderatorWarehouseIds;
    if ((!scopedIds || scopedIds.length === 0) && assignedWarehouseIds.length === 0) {
      return { id: { in: [] } };
    }
    const orClauses: object[] = [];
    if (scopedIds && scopedIds.length > 0) {
      orClauses.push(
        { warehouse: { orgUnitId: { in: scopedIds } } },
        { currentHolder: { orgUnitId: { in: scopedIds } } },
      );
    }
    if (assignedWarehouseIds.length > 0) {
      orClauses.push({ warehouseId: { in: assignedWarehouseIds } });
    }
    if (orClauses.length === 0) {
      return { id: { in: [] } };
    }
    return { OR: orClauses };
  }

  async buildEquipmentReadWhere(user: AuthenticatedUser): Promise<object | null> {
    return this.buildEquipmentScopeWhere(user);
  }

  async isEquipmentInScope(
    user: AuthenticatedUser,
    equipment: { id: string; warehouseId: string | null; currentHolderId: string | null },
    holder: { orgUnitId: string } | null,
    warehouseOrgUnitId?: string | null,
  ): Promise<boolean> {
    if (this.hasUnscopedAccess(user)) {
      return true;
    }
    if (!this.isModerator(user)) {
      return false;
    }
    if (isEquipmentHeldByUser(user, equipment)) {
      return true;
    }
    const scopedIds = await this.resolveModeratorOrgUnitIds(user);
    const scopedSet = scopedIds ? new Set(scopedIds) : new Set<string>();
    if (holder && scopedSet.has(holder.orgUnitId)) {
      return true;
    }
    if (equipment.warehouseId && user.moderatorWarehouseIds.includes(equipment.warehouseId)) {
      return true;
    }
    if (warehouseOrgUnitId && scopedSet.has(warehouseOrgUnitId)) {
      return true;
    }
    if (equipment.warehouseId && !warehouseOrgUnitId) {
      const warehouse = await this.prisma.warehouse.findUnique({
        where: { id: equipment.warehouseId },
        select: { orgUnitId: true },
      });
      if (warehouse?.orgUnitId && scopedSet.has(warehouse.orgUnitId)) {
        return true;
      }
    }
    return false;
  }

  async assertEquipmentInScope(
    user: AuthenticatedUser,
    equipment: { id: string; warehouseId: string | null; currentHolderId: string | null },
    holder: { orgUnitId: string } | null,
    warehouseOrgUnitId?: string | null,
  ): Promise<void> {
    const allowed = await this.isEquipmentInScope(user, equipment, holder, warehouseOrgUnitId);
    if (!allowed) {
      throw new ForbiddenException('Oprema je van vašeg opsega');
    }
  }

  async assertEmployeeInScope(user: AuthenticatedUser, employeeId: string): Promise<void> {
    if (this.hasUnscopedAccess(user)) {
      return;
    }
    if (!this.isModerator(user)) {
      throw new ForbiddenException('Radnik je van vašeg opsega');
    }
    if (isSelfEmployeeId(user, employeeId)) {
      return;
    }
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { orgUnitId: true },
    });
    if (!employee) {
      throw new ForbiddenException('Radnik nije pronađen');
    }
    await this.assertOrgUnitInScope(user, employee.orgUnitId);
  }

  async canAccessTransfer(
    user: AuthenticatedUser,
    transfer: {
      equipment: { id: string; warehouseId: string | null; currentHolderId: string | null };
      fromPerson: { orgUnitId: string } | null;
      toPerson: { orgUnitId: string } | null;
      equipmentHolder?: { orgUnitId: string } | null;
    },
  ): Promise<boolean> {
    if (this.hasUnscopedAccess(user)) {
      return true;
    }
    if (!this.isModerator(user)) {
      return false;
    }
    if (isEquipmentHeldByUser(user, transfer.equipment)) {
      return true;
    }
    const holder = transfer.equipmentHolder ?? null;
    if (await this.isEquipmentInScope(user, transfer.equipment, holder)) {
      return true;
    }
    const scopedIds = await this.resolveModeratorOrgUnitIds(user);
    if (!scopedIds || scopedIds.length === 0) {
      return false;
    }
    const scopedSet = new Set(scopedIds);
    if (transfer.fromPerson && scopedSet.has(transfer.fromPerson.orgUnitId)) {
      return true;
    }
    if (transfer.toPerson && scopedSet.has(transfer.toPerson.orgUnitId)) {
      return true;
    }
    return false;
  }

  async assertCanAccessTransfer(
    user: AuthenticatedUser,
    transfer: {
      equipment: { id: string; warehouseId: string | null; currentHolderId: string | null };
      fromPerson: { orgUnitId: string } | null;
      toPerson: { orgUnitId: string } | null;
      equipmentHolder?: { orgUnitId: string } | null;
    },
  ): Promise<void> {
    const allowed = await this.canAccessTransfer(user, transfer);
    if (!allowed) {
      throw new ForbiddenException('Prenosnica je van vašeg opsega');
    }
  }

  async buildTransferWhere(user: AuthenticatedUser): Promise<object> {
    const equipmentWhere = (await this.buildEquipmentScopeWhere(user)) ?? {};
    const employeeWhere = (await this.buildScopedEmployeeWhere(user)) ?? {};
    const orClauses: object[] = [
      { equipment: equipmentWhere },
      { fromPerson: employeeWhere },
      { toPerson: employeeWhere },
    ];
    if (user.employeeId) {
      orClauses.push({ fromPersonId: user.employeeId });
      orClauses.push({ toPersonId: user.employeeId });
    }
    return { OR: orClauses };
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
      if (scope.orgUnitId) {
        await this.assertOrgUnitInScope(actor, scope.orgUnitId);
        const effectiveWarehouseId = await this.warehouseResolution.resolveForOrgUnit(scope.orgUnitId);
        if (effectiveWarehouseId !== scope.warehouseId) {
          throw new ForbiddenException(
            'Skladište dodjele mora odgovarati efektivnom skladištu org. jedinice',
          );
        }
        continue;
      }
      await this.assertWarehouseInOrgScope(actor, scope.warehouseId);
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
      if (!isModeratorAssignableOrgType(unit.type)) {
        throw new ForbiddenException('Org jedinica mora biti valjan nivo za moderator opseg');
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

  private async isSelfEmployeeOrgUnit(user: AuthenticatedUser, orgUnitId: string): Promise<boolean> {
    if (!user.employeeId) {
      return false;
    }
    const employee = await this.prisma.employee.findUnique({
      where: { id: user.employeeId },
      select: { orgUnitId: true },
    });
    return employee?.orgUnitId === orgUnitId;
  }
}
