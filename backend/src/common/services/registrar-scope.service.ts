import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  Category,
  Employee,
  Equipment,
  TransferType,
  WarehouseStockLot,
} from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../types/authenticated-user.type';
import {
  isRegistrarModeA,
  type RegistrarScopeAssignment,
} from '../types/registrar-scope.type';
import { LocationResolutionService } from './location-resolution.service';
import { OrgScopeService } from './org-scope.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RegistrarScopeService {
  private categoryChildrenByParent = new Map<string | null, string[]>();
  private categoryCacheLoaded = false;

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
        return this.isEmployeeInWarehouseCoverage(assignment.warehouseId, holder.orgUnitId);
      }
      if (equipment.status === 'rashodovano') {
        return equipment.warehouseId === assignment.warehouseId;
      }
      return false;
    }
    if (equipment.status === 'skladiste') {
      return false;
    }
    if (!holder) {
      return false;
    }
    const subtreeIds = await this.orgScopeService.expandOrgUnitIds([assignment.orgUnitId!]);
    return subtreeIds.includes(holder.orgUnitId);
  }

  private async matchesAssignmentEmployee(
    assignment: RegistrarScopeAssignment,
    employee: Employee,
  ): Promise<boolean> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: assignment.warehouseId },
      select: { cityId: true, orgUnitId: true },
    });
    if (!warehouse) {
      return false;
    }
    const employeeCityId = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
      employee.orgUnitId,
    );
    if (employeeCityId !== warehouse.cityId) {
      return false;
    }
    if (isRegistrarModeA(assignment)) {
      if (!warehouse.orgUnitId) {
        return true;
      }
      return this.isEmployeeInWarehouseCoverage(assignment.warehouseId, employee.orgUnitId);
    }
    const subtreeIds = await this.orgScopeService.expandOrgUnitIds([assignment.orgUnitId!]);
    return subtreeIds.includes(employee.orgUnitId);
  }

  private async isEmployeeInWarehouseCoverage(
    warehouseId: string,
    employeeOrgUnitId: string,
  ): Promise<boolean> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { orgUnitId: true },
    });
    if (!warehouse) {
      return false;
    }
    if (!warehouse.orgUnitId) {
      return true;
    }
    const subtreeIds = await this.orgScopeService.expandOrgUnitIds([warehouse.orgUnitId]);
    return subtreeIds.includes(employeeOrgUnitId);
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
