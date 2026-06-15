import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  Category,
  Employee,
  Equipment,
  Prisma,
  TransferType,
  WarehouseStockLot,
} from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../types/authenticated-user.type';
import {
  isRegistrarModeA,
  type RegistrarScopeAssignment,
} from '../types/registrar-scope.type';
import {
  collectOrgUnitIdsForEffectiveWarehouse,
  intersectOrgUnitIdSets,
} from '../utils/collect-org-units-for-warehouse.util';
import type {
  OrgUnitWarehouseRow,
  WarehouseRow,
} from '../utils/resolve-effective-warehouse.util';
import { LocationResolutionService } from './location-resolution.service';
import { OrgScopeService } from './org-scope.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RegistrarScopeService {
  private categoryChildrenByParent = new Map<string | null, string[]>();
  private categoryCacheLoaded = false;
  private orgUnitsCache: OrgUnitWarehouseRow[] | null = null;
  private warehousesCache: WarehouseRow[] | null = null;
  private orgIdsByWarehouseCache = new Map<string, Set<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly locationResolutionService: LocationResolutionService,
    private readonly orgScopeService: OrgScopeService,
  ) {}

  hasFullAccess(user: AuthenticatedUser): boolean {
    return user.role === 'admin';
  }

  async loadAssignments(userId: string): Promise<RegistrarScopeAssignment[]> {
    const rows = await this.prisma.registrarAssignment.findMany({
      where: { userId },
      select: { warehouseId: true, categoryId: true, orgUnitId: true },
    });
    return rows;
  }

  async expandCategoryIds(categoryIds: string[]): Promise<Set<string>> {
    await this.ensureCategoryCache();
    const result = new Set<string>();
    const visit = (categoryId: string): void => {
      if (result.has(categoryId)) {
        return;
      }
      result.add(categoryId);
      const children = this.categoryChildrenByParent.get(categoryId) ?? [];
      for (const childId of children) {
        visit(childId);
      }
    };
    for (const categoryId of categoryIds) {
      visit(categoryId);
    }
    return result;
  }

  async resolveExpandedScopes(assignments: RegistrarScopeAssignment[]): Promise<{
    cityIds: Set<string>;
    categoryIds: Set<string>;
    warehouseIds: Set<string>;
  }> {
    const warehouseIds = new Set(assignments.map((row) => row.warehouseId));
    const warehouses = await this.prisma.warehouse.findMany({
      where: { id: { in: [...warehouseIds] } },
      select: { id: true, cityId: true },
    });
    const cityIds = new Set(warehouses.map((row) => row.cityId));
    const rootCategoryIds = assignments.map((row) => row.categoryId);
    const categoryIds = await this.expandCategoryIds(rootCategoryIds);
    return { cityIds, categoryIds, warehouseIds };
  }

  async resolveEquipmentCityId(
    equipment: Equipment & { currentHolder?: Employee | null; warehouse?: { cityId: string } | null },
  ): Promise<string | null> {
    if (equipment.currentHolderId && equipment.currentHolder) {
      return this.locationResolutionService.getEffectiveLocationForOrgUnit(
        equipment.currentHolder.orgUnitId,
      );
    }
    if (equipment.warehouseId && equipment.warehouse) {
      return equipment.warehouse.cityId;
    }
    if (equipment.warehouseId) {
      const warehouse = await this.prisma.warehouse.findUnique({
        where: { id: equipment.warehouseId },
        select: { cityId: true },
      });
      return warehouse?.cityId ?? null;
    }
    return null;
  }

  async canAccessEquipment(
    user: AuthenticatedUser,
    equipment: Equipment,
    holder: Employee | null,
    assignments?: RegistrarScopeAssignment[],
  ): Promise<boolean> {
    if (this.hasFullAccess(user)) {
      return true;
    }
    if (user.employeeId && equipment.currentHolderId === user.employeeId) {
      return true;
    }
    if (user.role !== 'evidenticar') {
      return false;
    }
    const scopes = assignments ?? user.registrarScopes;
    if (scopes.length === 0) {
      return false;
    }
    const categoryIds = await this.expandCategoryIds(scopes.map((row) => row.categoryId));
    if (!categoryIds.has(equipment.categoryId)) {
      return false;
    }
    for (const assignment of scopes) {
      const expanded = await this.expandCategoryIds([assignment.categoryId]);
      if (!expanded.has(equipment.categoryId)) {
        continue;
      }
      if (await this.matchesAssignmentEquipment(assignment, equipment, holder)) {
        return true;
      }
    }
    return false;
  }

  async assertCanAccessEquipment(
    user: AuthenticatedUser,
    equipment: Equipment,
    holder: Employee | null,
  ): Promise<void> {
    const allowed = await this.canAccessEquipment(user, equipment, holder);
    if (!allowed) {
      throw new ForbiddenException('Equipment outside your scope');
    }
  }

  async canAccessStockLot(
    user: AuthenticatedUser,
    lot: Pick<WarehouseStockLot, 'warehouseId' | 'categoryId'>,
    assignments?: RegistrarScopeAssignment[],
  ): Promise<boolean> {
    if (this.hasFullAccess(user)) {
      return true;
    }
    if (user.role !== 'evidenticar') {
      return false;
    }
    const scopes = assignments ?? user.registrarScopes;
    for (const assignment of scopes) {
      if (!isRegistrarModeA(assignment)) {
        continue;
      }
      if (assignment.warehouseId !== lot.warehouseId) {
        continue;
      }
      const expanded = await this.expandCategoryIds([assignment.categoryId]);
      if (expanded.has(lot.categoryId)) {
        return true;
      }
    }
    return false;
  }

  async assertCanAccessStockLot(
    user: AuthenticatedUser,
    lot: Pick<WarehouseStockLot, 'warehouseId' | 'categoryId'>,
  ): Promise<void> {
    const allowed = await this.canAccessStockLot(user, lot);
    if (!allowed) {
      throw new ForbiddenException('Stock lot outside your scope');
    }
  }

  async canAccessEmployee(
    user: AuthenticatedUser,
    employee: Employee,
    assignments?: RegistrarScopeAssignment[],
  ): Promise<boolean> {
    if (this.hasFullAccess(user)) {
      return true;
    }
    if (user.employeeId && employee.id === user.employeeId) {
      return true;
    }
    if (user.role !== 'evidenticar') {
      return false;
    }
    const scopes = assignments ?? user.registrarScopes;
    if (scopes.length === 0) {
      return false;
    }
    for (const assignment of scopes) {
      if (await this.matchesAssignmentEmployee(assignment, employee)) {
        return true;
      }
    }
    return false;
  }

  async canCreateTransferType(
    user: AuthenticatedUser,
    transferType: TransferType,
    assignments?: RegistrarScopeAssignment[],
  ): Promise<boolean> {
    if (this.hasFullAccess(user)) {
      return true;
    }
    if (user.role !== 'evidenticar') {
      return false;
    }
    const scopes = assignments ?? user.registrarScopes;
    if (transferType === 'zaduzenje') {
      return scopes.some((row) => isRegistrarModeA(row));
    }
    return scopes.length > 0;
  }

  async assertCanCreateTransferType(
    user: AuthenticatedUser,
    transferType: TransferType,
  ): Promise<void> {
    const allowed = await this.canCreateTransferType(user, transferType);
    if (!allowed) {
      throw new ForbiddenException('Transfer type not allowed for your registrar assignments');
    }
  }

  async getMatchingAssignmentsForEquipment(
    user: AuthenticatedUser,
    equipment: Equipment,
    holder: Employee | null,
    assignments?: RegistrarScopeAssignment[],
  ): Promise<RegistrarScopeAssignment[]> {
    const scopes = assignments ?? user.registrarScopes;
    const matches: RegistrarScopeAssignment[] = [];
    for (const assignment of scopes) {
      const expanded = await this.expandCategoryIds([assignment.categoryId]);
      if (!expanded.has(equipment.categoryId)) {
        continue;
      }
      if (await this.matchesAssignmentEquipment(assignment, equipment, holder)) {
        matches.push(assignment);
      }
    }
    return matches;
  }

  async canCreateTransferForEquipment(
    user: AuthenticatedUser,
    equipment: Equipment,
    holder: Employee | null,
    transferType: TransferType,
    assignments?: RegistrarScopeAssignment[],
  ): Promise<boolean> {
    if (this.hasFullAccess(user)) {
      return true;
    }
    if (user.role !== 'evidenticar') {
      return false;
    }
    const matches = await this.getMatchingAssignmentsForEquipment(
      user,
      equipment,
      holder,
      assignments,
    );
    if (matches.length === 0) {
      return false;
    }
    const hasModeA = matches.some((row) => isRegistrarModeA(row));
    if (!hasModeA) {
      return transferType === 'razduzenje';
    }
    return this.canCreateTransferType(user, transferType, matches);
  }

  async assertCanCreateTransferForEquipment(
    user: AuthenticatedUser,
    equipment: Equipment,
    holder: Employee | null,
    transferType: TransferType,
  ): Promise<void> {
    const allowed = await this.canCreateTransferForEquipment(
      user,
      equipment,
      holder,
      transferType,
    );
    if (!allowed) {
      throw new ForbiddenException('Transfer type not allowed for this equipment in your scope');
    }
  }

  async getScopedCityIds(user: AuthenticatedUser): Promise<Set<string> | null> {
    if (this.hasFullAccess(user)) {
      return null;
    }
    if (user.role !== 'evidenticar') {
      return new Set();
    }
    const { cityIds } = await this.resolveExpandedScopes(user.registrarScopes);
    return cityIds;
  }

  categoryMatchesScope(categoryId: string, categoryIds: Set<string>): boolean {
    return categoryIds.has(categoryId);
  }

  async buildEquipmentWhere(user: AuthenticatedUser): Promise<Prisma.EquipmentWhereInput> {
    if (this.hasFullAccess(user)) {
      return {};
    }
    if (user.role === 'user') {
      return user.employeeId ? { currentHolderId: user.employeeId } : { id: { in: [] } };
    }
    if (user.role === 'skladistar') {
      const keeperRows = await this.prisma.warehouseKeeper.findMany({
        where: { userId: user.id },
        select: { warehouseId: true },
      });
      const keeperIds = keeperRows.map((row) => row.warehouseId);
      if (keeperIds.length === 0) {
        return { id: { in: [] } };
      }
      return {
        warehouseId: { in: keeperIds },
        OR: [
          { status: 'skladiste' },
          { status: 'za_rashod' },
          {
            status: 'rashodovano',
            warehouseCondition: { in: ['spremno_za_unistenje', 'unisteno'] },
          },
        ],
      };
    }
    if (user.role === 'evidenticar') {
      if (user.registrarScopes.length === 0) {
        return user.employeeId
          ? { currentHolderId: user.employeeId }
          : { id: { in: [] } };
      }
      const clauses: Prisma.EquipmentWhereInput[] = [];
      for (const assignment of user.registrarScopes) {
        clauses.push(await this.buildAssignmentEquipmentWhere(assignment));
      }
      const scopeWhere = clauses.length === 1 ? clauses[0]! : { OR: clauses };
      if (user.employeeId) {
        return { OR: [scopeWhere, { currentHolderId: user.employeeId }] };
      }
      return scopeWhere;
    }
    return { id: { in: [] } };
  }

  async buildEmployeeWhere(user: AuthenticatedUser): Promise<Prisma.EmployeeWhereInput> {
    if (this.hasFullAccess(user)) {
      return {};
    }
    if (user.role === 'user') {
      return user.employeeId ? { id: user.employeeId } : { id: { in: [] } };
    }
    if (user.role === 'evidenticar') {
      if (user.registrarScopes.length === 0) {
        return user.employeeId ? { id: user.employeeId } : { id: { in: [] } };
      }
      const clauses: Prisma.EmployeeWhereInput[] = [];
      for (const assignment of user.registrarScopes) {
        clauses.push(await this.buildAssignmentEmployeeWhere(assignment));
      }
      const scopeWhere = clauses.length === 1 ? clauses[0]! : { OR: clauses };
      if (user.employeeId) {
        return { OR: [scopeWhere, { id: user.employeeId }] };
      }
      return scopeWhere;
    }
    return { id: { in: [] } };
  }

  async buildStockLotWhere(user: AuthenticatedUser): Promise<Prisma.WarehouseStockLotWhereInput> {
    if (this.hasFullAccess(user)) {
      return {};
    }
    if (user.role !== 'evidenticar') {
      return { id: { in: [] } };
    }
    if (user.registrarScopes.length === 0) {
      return { id: { in: [] } };
    }
    const clauses: Prisma.WarehouseStockLotWhereInput[] = [];
    for (const assignment of user.registrarScopes) {
      if (!isRegistrarModeA(assignment)) {
        continue;
      }
      const categoryIds = [...(await this.expandCategoryIds([assignment.categoryId]))];
      clauses.push({
        warehouseId: assignment.warehouseId,
        categoryId: { in: categoryIds },
      });
    }
    if (clauses.length === 0) {
      return { id: { in: [] } };
    }
    return clauses.length === 1 ? clauses[0]! : { OR: clauses };
  }

  async buildTransferWhere(user: AuthenticatedUser): Promise<Prisma.TransferWhereInput> {
    if (this.hasFullAccess(user)) {
      return {};
    }
    const equipmentWhere = await this.buildEquipmentWhere(user);
    const employeeWhere = await this.buildEmployeeWhere(user);
    const [equipmentRows, employeeRows, actor] = await Promise.all([
      this.prisma.equipment.findMany({ where: equipmentWhere, select: { id: true } }),
      this.prisma.employee.findMany({ where: employeeWhere, select: { id: true } }),
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: { employeeId: true },
      }),
    ]);
    const equipmentIds = equipmentRows.map((row) => row.id);
    const employeeIds = employeeRows.map((row) => row.id);
    const orClauses: Prisma.TransferWhereInput[] = [];
    if (equipmentIds.length > 0) {
      orClauses.push({ equipmentId: { in: equipmentIds } });
    }
    if (employeeIds.length > 0) {
      orClauses.push({ fromPersonId: { in: employeeIds } });
      orClauses.push({ toPersonId: { in: employeeIds } });
    }
    if (actor?.employeeId) {
      orClauses.push({
        inventoryLine: {
          committee: { members: { some: { employeeId: actor.employeeId } } },
        },
      });
    }
    if (orClauses.length === 0) {
      return { id: { in: [] } };
    }
    return { OR: orClauses };
  }

  async canAccessTransfer(
    user: AuthenticatedUser,
    transfer: {
      fromPerson: Pick<Employee, 'id' | 'orgUnitId'> | null;
      toPerson: Pick<Employee, 'id' | 'orgUnitId'> | null;
      equipment: Equipment;
      holder: Employee | null;
    },
  ): Promise<boolean> {
    if (this.hasFullAccess(user)) {
      return true;
    }
    if (user.role !== 'evidenticar') {
      return false;
    }
    if (await this.canAccessEquipment(user, transfer.equipment, transfer.holder)) {
      return true;
    }
    if (transfer.fromPerson) {
      const fromEmployee = transfer.fromPerson as Employee;
      if (await this.canAccessEmployee(user, fromEmployee)) {
        return true;
      }
    }
    if (transfer.toPerson) {
      const toEmployee = transfer.toPerson as Employee;
      if (await this.canAccessEmployee(user, toEmployee)) {
        return true;
      }
    }
    return false;
  }

  private async buildAssignmentEquipmentWhere(
    assignment: RegistrarScopeAssignment,
  ): Promise<Prisma.EquipmentWhereInput> {
    const categoryIds = [...(await this.expandCategoryIds([assignment.categoryId]))];
    const categoryFilter: Prisma.EquipmentWhereInput = { categoryId: { in: categoryIds } };
    if (isRegistrarModeA(assignment)) {
      const holderOrgIds = [...(await this.getOrgUnitIdsForWarehouse(assignment.warehouseId))];
      const zaduzenoClause: Prisma.EquipmentWhereInput =
        holderOrgIds.length > 0
          ? {
              status: 'zaduzeno',
              currentHolder: { orgUnitId: { in: holderOrgIds } },
            }
          : { id: { in: [] } };
      return {
        AND: [
          categoryFilter,
          {
            OR: [
              { status: 'skladiste', warehouseId: assignment.warehouseId },
              zaduzenoClause,
              { status: 'za_rashod', warehouseId: assignment.warehouseId },
              { status: 'rashodovano', warehouseId: assignment.warehouseId },
            ],
          },
        ],
      };
    }
    const effectiveOrgIds = await this.getEffectiveOrgIdsForModeB(assignment);
    if (effectiveOrgIds.length === 0) {
      return { id: { in: [] } };
    }
    return {
      AND: [
        categoryFilter,
        { status: 'zaduzeno' },
        { currentHolder: { orgUnitId: { in: effectiveOrgIds } } },
      ],
    };
  }

  private async buildAssignmentEmployeeWhere(
    assignment: RegistrarScopeAssignment,
  ): Promise<Prisma.EmployeeWhereInput> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: assignment.warehouseId },
      select: { id: true },
    });
    if (!warehouse) {
      return { id: { in: [] } };
    }
    if (isRegistrarModeA(assignment)) {
      const orgUnitIds = [...(await this.getOrgUnitIdsForWarehouse(assignment.warehouseId))];
      return orgUnitIds.length > 0 ? { orgUnitId: { in: orgUnitIds } } : { id: { in: [] } };
    }
    const effectiveOrgIds = await this.getEffectiveOrgIdsForModeB(assignment);
    return effectiveOrgIds.length > 0
      ? { orgUnitId: { in: effectiveOrgIds } }
      : { id: { in: [] } };
  }

  private async matchesAssignmentEquipment(
    assignment: RegistrarScopeAssignment,
    equipment: Equipment,
    holder: Employee | null,
  ): Promise<boolean> {
    if (assignment.warehouseId && equipment.warehouseId !== assignment.warehouseId) {
      if (equipment.status === 'skladiste') {
        return false;
      }
    }
    if (isRegistrarModeA(assignment)) {
      if (equipment.status === 'skladiste') {
        return equipment.warehouseId === assignment.warehouseId;
      }
      if (equipment.status === 'zaduzeno' && holder) {
        return this.isOrgUnitInEffectiveWarehouseScope(assignment.warehouseId, holder.orgUnitId);
      }
      if (equipment.status === 'rashodovano' || equipment.status === 'za_rashod') {
        return equipment.warehouseId === assignment.warehouseId;
      }
      return false;
    }
    if (equipment.status !== 'zaduzeno' || !holder) {
      return false;
    }
    const effectiveOrgIds = await this.getEffectiveOrgIdsForModeB(assignment);
    return effectiveOrgIds.includes(holder.orgUnitId);
  }

  private async matchesAssignmentEmployee(
    assignment: RegistrarScopeAssignment,
    employee: Employee,
  ): Promise<boolean> {
    if (isRegistrarModeA(assignment)) {
      return this.isOrgUnitInEffectiveWarehouseScope(
        assignment.warehouseId,
        employee.orgUnitId,
      );
    }
    const effectiveOrgIds = await this.getEffectiveOrgIdsForModeB(assignment);
    return effectiveOrgIds.includes(employee.orgUnitId);
  }

  private async isOrgUnitInEffectiveWarehouseScope(
    warehouseId: string,
    orgUnitId: string,
  ): Promise<boolean> {
    const orgIds = await this.getOrgUnitIdsForWarehouse(warehouseId);
    return orgIds.has(orgUnitId);
  }

  private async getEffectiveOrgIdsForModeB(
    assignment: RegistrarScopeAssignment,
  ): Promise<string[]> {
    const warehouseOrgIds = await this.getOrgUnitIdsForWarehouse(assignment.warehouseId);
    const assignmentSubtree = new Set(
      await this.orgScopeService.expandOrgUnitIds([assignment.orgUnitId!]),
    );
    return intersectOrgUnitIdSets(warehouseOrgIds, assignmentSubtree);
  }

  private async getOrgUnitIdsForWarehouse(warehouseId: string): Promise<Set<string>> {
    const cached = this.orgIdsByWarehouseCache.get(warehouseId);
    if (cached) {
      return cached;
    }
    await this.ensureOrgWarehouseCache();
    const orgUnits = this.orgUnitsCache ?? [];
    const warehouses = this.warehousesCache ?? [];
    const cityByOrgUnit = new Map<string, string | null>();
    for (const unit of orgUnits) {
      cityByOrgUnit.set(
        unit.id,
        await this.locationResolutionService.getEffectiveLocationForOrgUnit(unit.id),
      );
    }
    const orgIds = collectOrgUnitIdsForEffectiveWarehouse(
      warehouseId,
      orgUnits,
      warehouses,
      (orgUnitId) => cityByOrgUnit.get(orgUnitId) ?? null,
    );
    this.orgIdsByWarehouseCache.set(warehouseId, orgIds);
    return orgIds;
  }

  private async ensureOrgWarehouseCache(): Promise<void> {
    if (this.orgUnitsCache && this.warehousesCache) {
      return;
    }
    const [orgUnits, warehouses] = await Promise.all([
      this.prisma.orgUnit.findMany({ select: { id: true, parentId: true } }),
      this.prisma.warehouse.findMany({
        select: { id: true, orgUnitId: true, cityId: true, isActive: true, createdAt: true },
      }),
    ]);
    this.orgUnitsCache = orgUnits;
    this.warehousesCache = warehouses;
  }

  private async ensureCategoryCache(): Promise<void> {
    if (this.categoryCacheLoaded) {
      return;
    }
    const categories = await this.prisma.category.findMany({
      select: { id: true, parentId: true },
    });
    this.categoryChildrenByParent = new Map();
    for (const category of categories) {
      const siblings = this.categoryChildrenByParent.get(category.parentId) ?? [];
      siblings.push(category.id);
      this.categoryChildrenByParent.set(category.parentId, siblings);
    }
    this.categoryCacheLoaded = true;
  }
}
