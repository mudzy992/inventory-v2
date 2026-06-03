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
  if (user.role === 'user') {
    return Boolean(user.employeeId && equipment.currentHolderId === user.employeeId);
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
  await assertCanReadEquipment(user, equipment, holder, registrarScope, prisma);
};
