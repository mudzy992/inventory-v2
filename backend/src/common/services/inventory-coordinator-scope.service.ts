import { isSystemAdmin } from '../auth/authorization-policy.util';
import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../types/authenticated-user.type';
import type { CoordinatorScopeAssignment } from '../types/coordinator-scope.type';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InventoryCoordinatorScopeService {
  constructor(private readonly prisma: PrismaService) {}

  hasFullAccess(user: AuthenticatedUser): boolean {
    return isSystemAdmin(user);
  }

  async loadAssignments(userId: string): Promise<CoordinatorScopeAssignment[]> {
    const rows = await this.prisma.inventoryCoordinatorAssignment.findMany({
      where: { userId },
      select: { warehouseId: true, orgUnitId: true },
    });
    return rows;
  }

  canManageWarehouse(user: AuthenticatedUser, warehouseId: string): boolean {
    if (this.hasFullAccess(user)) {
      return true;
    }
    if (user.role === 'moderator') {
      return user.moderatorWarehouseIds.includes(warehouseId);
    }
    if (user.role !== 'popis_koordinator') {
      return false;
    }
    return user.coordinatorAssignments.some((row) => row.warehouseId === warehouseId);
  }

  async assertCanManageWarehouse(user: AuthenticatedUser, warehouseId: string): Promise<void> {
    if (this.canManageWarehouse(user, warehouseId)) {
      return;
    }
    throw new ForbiddenException('Warehouse outside your inventory coordinator scope');
  }

  async getAssignedWarehouseIds(user: AuthenticatedUser): Promise<string[]> {
    if (this.hasFullAccess(user)) {
      return [];
    }
    if (user.role !== 'popis_koordinator') {
      return [];
    }
    return [...new Set(user.coordinatorAssignments.map((row) => row.warehouseId))];
  }

  async getAssignedOrgUnitIds(user: AuthenticatedUser): Promise<string[]> {
    if (this.hasFullAccess(user)) {
      return [];
    }
    if (user.role !== 'popis_koordinator') {
      return [];
    }
    const orgUnitIds = user.coordinatorAssignments
      .map((row) => row.orgUnitId)
      .filter((id): id is string => Boolean(id));
    return [...new Set(orgUnitIds)];
  }
}
