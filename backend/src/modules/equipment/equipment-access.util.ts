import { ForbiddenException } from '@nestjs/common';
import type { Equipment, Employee } from '../../../generated/prisma/client';
import type { ModeratorScopeService } from '../../common/services/moderator-scope.service';
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
  moderatorScope?: ModeratorScopeService,
): Promise<boolean> => {
  if (user.role === 'admin') {
    return true;
  }
  if (user.role === 'moderator' && moderatorScope) {
    return moderatorScope.isEquipmentInScope(user, equipment, holder);
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
  moderatorScope?: ModeratorScopeService,
): Promise<void> => {
  const allowed = await canReadEquipment(
    user,
    equipment,
    holder,
    registrarScope,
    prisma,
    moderatorScope,
  );
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
  moderatorScope?: ModeratorScopeService,
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
    if (!moderatorScope) {
      throw new ForbiddenException('Moderator scope unavailable');
    }
    await moderatorScope.assertEquipmentInScope(user, equipment, holder);
    return;
  }
  await assertCanReadEquipment(user, equipment, holder, registrarScope, prisma, moderatorScope);
};
