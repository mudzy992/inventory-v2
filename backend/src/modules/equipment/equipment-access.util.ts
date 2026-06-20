import { ForbiddenException } from '@nestjs/common';
import type { Equipment, Employee } from '../../../generated/prisma/client';
import type { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  canKeeperReadEquipment,
  canKeeperWriteEquipment,
  resolveKeeperWarehouseIds,
} from '../../common/utils/warehouse-keeper-access.util';

export const canReadEquipment = async (
  user: AuthenticatedUser,
  equipment: Equipment,
  holder: Employee | null,
  registrarScope: RegistrarScopeService,
  prisma?: PrismaService,
): Promise<boolean> => {
  if (user.role === 'admin') {
    return true;
  }
  if (user.role === 'moderator' && prisma) {
    const orgIds = await expandOrgIds(prisma, user.moderatorOrgRoots);
    if (orgIds.length === 0) {
      return false;
    }
    const orgSet = new Set(orgIds);
    if (holder && orgSet.has(holder.orgUnitId)) {
      return true;
    }
    if (equipment.warehouseId) {
      const warehouse = await prisma.warehouse.findUnique({
        where: { id: equipment.warehouseId },
        select: { orgUnitId: true },
      });
      if (warehouse?.orgUnitId && orgSet.has(warehouse.orgUnitId)) {
        return true;
      }
    }
    return false;
  }
  if (user.role === 'skladistar') {
    if (!prisma) {
      return false;
    }
    const keeperWarehouseIds = await resolveKeeperWarehouseIds(prisma, user);
    if (!keeperWarehouseIds) {
      return false;
    }
    return canKeeperReadEquipment(equipment, keeperWarehouseIds);
  }
  if (user.employeeId && equipment.currentHolderId === user.employeeId) {
    return true;
  }
  if (user.role === 'user') {
    return false;
  }
  if (user.role === 'evidenticar') {
    return registrarScope.canAccessEquipment(user, equipment, holder);
  }
  return false;
};

export const assertCanReadEquipment = async (
  user: AuthenticatedUser,
  equipment: Equipment,
  holder: Employee | null,
  registrarScope: RegistrarScopeService,
  prisma?: PrismaService,
): Promise<void> => {
  const allowed = await canReadEquipment(user, equipment, holder, registrarScope, prisma);
  if (!allowed) {
    throw new ForbiddenException('Equipment outside your scope');
  }
};

export const assertCanWriteEquipment = async (
  user: AuthenticatedUser,
  equipment: Equipment,
  holder: Employee | null,
  registrarScope: RegistrarScopeService,
  prisma?: PrismaService,
): Promise<void> => {
  if (user.role === 'admin') {
    return;
  }
  if (user.role === 'skladistar') {
    if (!prisma) {
      throw new ForbiddenException('Skladistar scope unavailable');
    }
    const keeperWarehouseIds = await resolveKeeperWarehouseIds(prisma, user);
    if (!keeperWarehouseIds || !canKeeperWriteEquipment(equipment, keeperWarehouseIds)) {
      throw new ForbiddenException('Equipment outside your warehouse write scope');
    }
    return;
  }
  if (user.role === 'user') {
    throw new ForbiddenException('Users cannot modify equipment');
  }
  if (user.role === 'moderator') {
    throw new ForbiddenException('Moderator cannot modify equipment');
  }
  await assertCanReadEquipment(user, equipment, holder, registrarScope, prisma);
};

const expandOrgIds = async (prisma: PrismaService, rootIds: string[]): Promise<string[]> => {
  if (rootIds.length === 0) {
    return [];
  }
  const allUnits = await prisma.orgUnit.findMany({
    select: { id: true, parentId: true },
  });
  const childrenByParent = new Map<string | null, string[]>();
  for (const unit of allUnits) {
    const siblings = childrenByParent.get(unit.parentId) ?? [];
    siblings.push(unit.id);
    childrenByParent.set(unit.parentId, siblings);
  }
  const result = new Set<string>();
  const visit = (id: string): void => {
    if (result.has(id)) {
      return;
    }
    result.add(id);
    for (const childId of childrenByParent.get(id) ?? []) {
      visit(childId);
    }
  };
  for (const rootId of rootIds) {
    visit(rootId);
  }
  return [...result];
};
